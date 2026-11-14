"""Analyze authentic, single-date NISAR GCOV power in an Everglades ROI.

Place in SARS repository root. Run with `pipeline/.venv/Scripts/python.exe analyze_everglades_observations.py`.
No temporal differences, environmental claims, credentials, or signed URLs in outputs.
"""
from __future__ import annotations

import hashlib
import csv
import json
import math
from pathlib import Path

import h5py
import numpy as np
import requests
from rasterio.crs import CRS
from rasterio.transform import Affine

from pipeline.check_compatibility import GRID, catalog, dataset, inspect_metadata
from pipeline.common import geographic_bounds, mercator_grid, power_to_db, write_png
from pipeline.fetch_nisar import authenticated_session, load_asf
from pipeline.science_validation import gamma0_check, inspect_quality_grids, screen_power
from pipeline.sources import RangeReader

ROOT = Path(__file__).resolve().parent
STUDY = ROOT / "pipeline/studies/california_plaskett_20260822_20260915.json"
OUTPUT = ROOT / "pipeline/output/california-analysis"
SCALES = {"HH": (-25.0, 0.0), "HV": (-30.0, -5.0)}
MAX_SOURCE_BYTES = 64 * 1024**2  # applied per product, never whole-file download


def analyze():
    config = json.loads(STUDY.read_text(encoding="utf-8-sig"))
    roi = config["roiWgs84"]
    if len(config["granules"]) != 2 or len(config["expectedDates"]) != 2:
        raise RuntimeError("Expected exactly two configured granules and dates")
    if len(roi) != 4:
        raise RuntimeError("Invalid study ROI")
    # A full-frame HDF5 download is intentionally not performed.
    prepared = []
    auth = authenticated_session(load_asf())
    try:
        with requests.Session() as public:
            for concept, date in zip(config["granules"], config["expectedDates"], strict=True):
                info = catalog(public, concept, roi)
                if info["times"]["BeginningDateTime"][:10] != date:
                    raise RuntimeError(f"Acquisition date mismatch for {concept}")
                if not info["catalogRoiCovered"]:
                    raise RuntimeError(f"Catalog ROI not covered for {concept}")
                reader = RangeReader(auth, info["url"], int(info["file"]["SizeInBytes"]), max_bytes=MAX_SOURCE_BYTES)
                try:
                    with reader, h5py.File(reader, "r") as h5:
                        metadata = inspect_metadata(h5, roi, int(config["maxRoiPixels"]))
                        if metadata["identification"].get("trackNumber") != 135 or metadata["identification"].get("frameNumber") != 20:
                            raise RuntimeError("Unexpected track/frame; refusing to export")
                        grid = metadata["frequencies"].get("frequencyA")
                        if grid is None:
                            raise RuntimeError("Frequency A absent")
                        if not grid["gridCoversRoi"]:
                            raise RuntimeError("Source raster does not cover requested ROI")
                        gamma_status, gamma_detail = gamma0_check(metadata)
                        if gamma_status != "PASS":
                            raise RuntimeError(f"Gamma0 validation {gamma_status}: {gamma_detail}")
                        prefix = GRID + "frequencyA/"
                        r0, r1, c0, c1 = grid["window"]
                        mask_ds = dataset(h5, prefix + "mask")
                        mask_scales = [[d.name for d in mask_ds.dims[i].values()] for i in range(2)]
                        mask_description = grid["datasets"]["mask"]["attributes"].get("description", "").lower()
                        mask_ok = (mask_scales == [[prefix + "yCoordinates"], [prefix + "xCoordinates"]]
                                   and "partially focused" in mask_description
                                   and "255" in mask_description and "value 0" in mask_description)
                        if not mask_ok:
                            raise RuntimeError("Subswath mask/grid semantics not established")
                        mask = np.asarray(mask_ds[r0:r1, c0:c1])
                        exception = inspect_quality_grids(h5, metadata, "frequencyA", dataset)
                        crs = CRS.from_string(grid["crs"])
                        dx, dy = grid["spacing"]
                        x0, y0 = grid["roiFirstCenter"]
                        transform = Affine(dx, 0, x0 - dx / 2, 0, dy, y0 - dy / 2)
                        target = mercator_grid(crs, transform, tuple(grid["roiShape"]), 1024)
                        bounds = geographic_bounds(CRS.from_epsg(3857), target[0], (target[2], target[1]))
                        images = {}
                        for pol, label in (("HHHH", "HH"), ("HVHV", "HV")):
                            ds = dataset(h5, prefix + pol)
                            power = np.asarray(ds[r0:r1, c0:c1])
                            valid, counts = screen_power(power, mask, ds.attrs.get("_FillValue"), exception)
                            if not np.any(valid):
                                raise RuntimeError(f"No screened pixels for {date} {label}")
                            db = power_to_db(np.where(valid, power, np.nan))
                            filename = f"{date.replace('-', '')}_{label}.png"
                            samples = np.asarray(db[np.isfinite(db)], dtype=np.float64)
                            hist, edges = np.histogram(samples, bins=48, range=SCALES[label])
                            statistics = {
                                "screenedPixels": int(samples.size),
                                "meanDb": float(samples.mean()),
                                "medianDb": float(np.median(samples)),
                                "stdDb": float(samples.std()),
                                "p05Db": float(np.percentile(samples, 5)),
                                "p25Db": float(np.percentile(samples, 25)),
                                "p75Db": float(np.percentile(samples, 75)),
                                "p95Db": float(np.percentile(samples, 95)),
                                "minDb": float(samples.min()), "maxDb": float(samples.max()),
                                "histogram": {"binEdgesDb": [float(x) for x in edges],
                                              "counts": [int(x) for x in hist],
                                              "outsideDisplayRange": int(samples.size - hist.sum())},
                            }
                            images[label] = {"filename": filename, "screenedPixels": int(valid.sum()),
                                             "screenCounts": counts, "displayRangeDb": list(SCALES[label]),
                                             "descriptiveStatistics": statistics}
                            # Stage data in memory, before committing any files to output.
                            images[label]["_db"] = db
                        prepared.append({"date": date, "conceptId": concept, "track": 135, "frame": 20,
                                         "crs": str(crs), "spacing": [dx, dy], "roiShape": grid["roiShape"],
                                         "bounds": bounds, "transform": transform, "target": target,
                                         "images": images, "transferAudit": reader.audit(),
                                         "gamma0Status": gamma_status,
                                         "exceptionScreenAvailable": exception is not None})
                finally:
                    reader.close()
    finally:
        auth.close()
    # Both source footprints must match exactly before writing geographically comparable previews.
    a, b = prepared
    if a["crs"] != b["crs"] or a["roiShape"] != b["roiShape"] or a["spacing"] != b["spacing"]:
        raise RuntimeError("Input grids disagree")
    if not a["transform"].almost_equals(b["transform"], precision=1e-6):
        raise RuntimeError("Input grid origins disagree")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"schemaVersion": "preview-1.0", "provenance": "NASA NISAR GCOV via ASF DAAC",
                "sourceCollection": "NISAR L2 GCOV provisional", "studyRoiWgs84": roi,
                "bounds": a["bounds"], "nativeCrs": a["crs"], "nativeShape": a["roiShape"],
                "pixelSpacingMeters": a["spacing"],
                "measurement": "dimensionless gamma0 linear power converted to dB using 10 log10",
                "purpose": "Exploratory single-date descriptive statistics; two distributions for visual inspection only. No paired change calculation or environmental interpretation",
                "scientificClearance": "NOT CLEARED FOR QUANTITATIVE ANALYSIS",
                "knownConcerns": ["official QA identification failures require review",
                                  "RFI/noise and radiometric artifacts require review"],
                "acquisitions": []}
    for item in prepared:
        out = {"date": item["date"], "conceptId": item["conceptId"],
               "track": item["track"], "frame": item["frame"],
               "gamma0Status": item["gamma0Status"], "exceptionScreenAvailable": item["exceptionScreenAvailable"],
               "images": {}}
        for label, record in item["images"].items():
            path = OUTPUT / record["filename"]
            write_png(path, record["_db"], CRS.from_string(item["crs"]), item["transform"], item["target"], SCALES[label])
            out["images"][label] = {k:v for k,v in record.items() if not k.startswith("_")}
            out["images"][label]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest["acquisitions"].append(out)
        print(f"Analyzed authentic NASA-derived HH/HV observations for {item['date']} ({item['conceptId']})")
    (OUTPUT / "descriptive-statistics.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    for label in ("HH", "HV"):
        a, b = [item["images"][label]["descriptiveStatistics"]["histogram"] for item in manifest["acquisitions"]]
        path = OUTPUT / f"{label}_histograms.csv"
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["bin_low_db", "bin_high_db", "sep30_count", "oct12_count"])
            for i in range(len(a["counts"])):
                writer.writerow([a["binEdgesDb"][i], a["binEdgesDb"][i+1], a["counts"][i], b["counts"][i]])
    print(f"Saved real per-date descriptive statistics and two histogram CSV files to {OUTPUT}")
    print("Scientific QA remains NOT CLEARED. Do not attribute radar differences to wildfire without independent validation.")


if __name__ == "__main__":
    try:
        analyze()
    except Exception as exc:
        # Don't print raw exceptions; HTTP errors may contain signed URLs or credentials.
        print(f"Export failed safely: {type(exc).__name__}. Inspect data/metadata prerequisites without sharing token or signed URLs.")
        raise SystemExit(1)


