"""Assemble separately downloaded *authentic* single-granule GCOV reduced grids.

Never interpolates source data or infers dates. Requires exactly the native
track/frame, aligned CRS/affine, processing versions and calibration releases
from both original single-acquisition manifests. Rebuilds genuine per-pixel
change rasters from original numerical COGs, not PNG colors.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil

from affine import Affine
import numpy as np
import rasterio

from pipeline.common import CHANGE_RANGE, write_cog, write_png

DATES = ("2026-09-25", "2026-10-19")


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf8"))


def extract_raster(path: Path):
    with rasterio.open(path) as src:
        arr = src.read(1).astype(np.float32)
        if src.nodata is not None:
            arr[arr == src.nodata] = np.nan
        return arr, src.crs, src.transform


def assemble(root: Path, destination: Path) -> dict:
    sources = [root / day.replace("-", "") for day in DATES]
    reports = [read(p / "discovery.json") for p in sources]
    for i, rep in enumerate(reports):
        if rep["status"] != "EXPLORATORY_DERIVED_SINGLE" or rep["day"] != DATES[i]:
            raise ValueError("An exact real NISAR single-acquisition derivative is missing")
    manifests = [read(p / "processed" / "manifest.json") for p in sources]
    frames = [m["frames"][0] for m in manifests]
    for f in frames:
        if f["id"] != "T105_F023_A" or len(f["acquisitions"]) != 1:
            raise ValueError("Unexpected acquisition frame or count")
    a, b = (f["acquisitions"][0] for f in frames)
    for index, x in enumerate((a, b)):
        if x["date"][:10] != DATES[index]:
            raise ValueError("Acquisition date does not match the required one")
    for key in ("id", "track", "frame", "passDirection", "overlayCrs", "overlaySize"):
        if frames[0][key] != frames[1][key]:
            raise ValueError("Incompatible frame coordinate systems: "+key)
    if not np.allclose(frames[0]["overlayTransform"], frames[1]["overlayTransform"], rtol=0, atol=1e-5):
        raise ValueError("Overlay geometry mismatch")
    if not np.allclose(frames[0]["bounds"], frames[1]["bounds"], rtol=0, atol=1e-6):
        raise ValueError("Geographic bounds mismatch")
    for key in ("nativeCrs", "analysisSize", "analysisBounds"):
        if a[key] != b[key]:
            raise ValueError("Mismatch in native cropped grids: "+key)
    if not np.allclose(a["analysisTransform"], b["analysisTransform"], rtol=0, atol=1e-6):
        raise ValueError("Native analysis-grid affine transform mismatch")
    for key in ("productVersion", "compositeReleaseId", "dataMaturity", "productSpecificationVersion"):
        if a[key] != b[key]:
            raise ValueError("Incompatible science processing calibration: "+key)

    target_dir = destination / "processed"
    target_dir.mkdir(parents=True, exist_ok=True)
    for src in sources:
        files = (src / "processed").rglob("*")
        for source in files:
            if source.is_file() and source.name != "manifest.json":
                dest = target_dir / source.relative_to(src / "processed")
                dest.parent.mkdir(parents=True, exist_ok=True)
                if dest.exists():
                    raise ValueError("Conflicting data file on assembly")
                shutil.copyfile(source, dest)
    frame = dict(frames[0])
    frame["acquisitions"] = [a, b]
    frame["changeLayers"] = []
    frame["mixedVersions"] = False
    frame["gaps"] = []
    name = "T105_F023_A/change_20260925_20261019"
    ref = {}
    out = {}
    for pol in ("HH", "HV"):
        early, crs0, trans0 = extract_raster(target_dir / a["cog"][pol])
        late, crs1, trans1 = extract_raster(target_dir / b["cog"][pol])
        if crs0 != crs1 or early.shape != late.shape or not trans0.almost_equals(trans1):
            raise ValueError("COG grids not identical for "+pol)
        ref[pol], out[pol] = early, late
        path = name + ("" if pol == "HH" else "_HV")
        delta = late - early
        write_cog(target_dir / (path + ".tif"), delta, crs0, trans0)
        target = (Affine(*frame["overlayTransform"]), *frame["overlaySize"])
        write_png(target_dir / (path + ".png"), delta, crs0, trans0, target, CHANGE_RANGE, cmap="RdBu_r", quantize=True)
        frame["changeLayers"].append({
            "from": a["date"], "to": b["date"], "type": "dbDiff",
            "pol": pol, "url": path + ".png", "cog": path + ".tif", "mixedVersions": False,
        })
    crosspath = name + "_HVHH"
    crs = rasterio.crs.CRS.from_string(a["nativeCrs"])
    transform = Affine(*a["analysisTransform"])
    delta = out["HV"] - out["HH"]
    write_cog(target_dir / (crosspath + ".tif"), delta, crs, transform)
    write_png(target_dir / (crosspath + ".png"), delta, crs, transform,
              (Affine(*frame["overlayTransform"]), *frame["overlaySize"]),
              CHANGE_RANGE, cmap="RdBu_r", quantize=True)
    frame["changeLayers"].append({
        "from": a["date"], "to": b["date"], "type": "hvhhDiff",
        "pol": "HV-HH", "url": crosspath + ".png", "cog": crosspath + ".tif",
        "mixedVersions": False,
        "interpretation": "HV minus HH at the later acquisition, not temporal change.",
    })
    manifest = dict(manifests[0])
    manifest["frames"] = [frame]
    manifest["processingNotes"] = [*manifest.get("processingNotes", []),
        "The two 7 GB HDF5 acquisitions were independently downloaded and validated, each processed using the same code and ROI.",
        "The original numerical reduced-grid COGs were checked for identical geometry, native pixel coordinates and processing release before subtracting.",
        "Source HDF5 files were deleted after individual processing. Difference rasters are mathematical later-minus-earlier operations.",
    ]
    (target_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False)+"\n")
    summary = {
        "site": "iowa-full", "roiWgs84": [-93.64,42,-93.60,42.04],
        "status": "EXPLORATORY_PROCESSED_NOT_QA_CLEARED",
        "selected": [{"date": DATES[i], "sceneName": rep["source"]["sceneName"]}
                     for i, rep in enumerate(reports)],
        "processing": "separate exact-source HDF5 validated acquisitions, numerical COG differencing",
    }
    (destination / "discovery.json").write_text(json.dumps(summary, indent=2)+"\n")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--single", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    m=assemble(args.single, args.out)
    print(f"Assembled exact Iowa dates with {len(m['frames'][0]['changeLayers'])} authentic numerical difference layers")
