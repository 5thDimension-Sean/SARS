"""Download and process one *exact* NISAR acquisition without storing both 7GB files.

Used only for large GCOVs that do not fit jointly on GitHub-hosted runners.
No Earthdata credentials or signed URLs are written into Git.
"""
from __future__ import annotations

import argparse
from datetime import date
import json
import os
from pathlib import Path
import shutil

from pipeline.fetch_nisar import load_asf, search_kwargs, catalog_metadata, expected_size, product_filename, download_products
from pipeline.nisar_to_overlays import process_directory

AOI = (-93.64, 42.0, -93.60, 42.04)
EXPECTED = {
    "2026-09-25": ("105", "23", "ASCENDING"),
    "2026-10-19": ("105", "23", "ASCENDING"),
}
MAX_FILE_BYTES = 8_000_000_000

def run(day: str, out: Path) -> None:
    if day not in EXPECTED: raise ValueError("Unsupported requested date")
    out.mkdir(parents=True, exist_ok=True)
    report = {"status": "DISCOVERY_PENDING", "day": day, "aoi": list(AOI)}
    raw = out / "raw"
    try:
        asf = load_asf()
        query = argparse.Namespace(bbox=AOI, start=day, end=day,
                                   maturity="PROVISIONAL", max_results=50,
                                   track=105, frame=23)
        products = list(asf.search(**search_kwargs(query, asf)))
        candidates = []
        for p in products:
            props = p.properties
            try:
                name = product_filename(p)
                size = expected_size(props, name)
                if "_DHDH_A_" not in name or not size or size > MAX_FILE_BYTES:
                    continue
                if str(props.get("startTime", ""))[:10] != day:
                    continue
                if str(props.get("pathNumber")) != "105" or str(props.get("frameNumber")) != "23":
                    continue
                if str(props.get("flightDirection", "")).upper() != "ASCENDING":
                    continue
                m = catalog_metadata(p)
                if m.get("compositeReleaseId") != "P05023":
                    continue
                candidates.append((p, name, size))
            except Exception:
                continue
        report["catalogProducts"] = len(products)
        report["candidateCount"] = len(candidates)
        if len(candidates) != 1:
            report["status"] = "NOT_UNIQUELY_COMPATIBLE"
            return
        p, name, size = candidates[0]
        report["source"] = {
            "date": day, "sceneName": str(p.properties.get("sceneName") or p.properties.get("fileID")),
            "sizeBytes": size, "track": "105", "frame": "23",
            "compositeReleaseId": "P05023", "orbitDirection": "ASCENDING"
        }
        if not os.environ.get("EARTHDATA_TOKEN"):
            report["status"] = "NO_EARTHDATA_SECRET"
            return
        if shutil.disk_usage(out).free < size + 2_000_000_000:
            report["status"] = "INSUFFICIENT_DISK"
            return
        download_products([p], raw, asf)
        report["status"] = "DOWNLOADED"
        manifest = process_directory(raw, out / "processed", aoi=AOI,
                                     pols=("HHHH", "HVHV"), max_size=2048,
                                     png_quantize=True)
        if len(manifest["frames"]) != 1 or len(manifest["frames"][0]["acquisitions"]) != 1:
            raise ValueError("Expected one genuine GCOV acquisition")
        a = manifest["frames"][0]["acquisitions"][0]
        if a["date"][:10] != day or manifest["frames"][0]["id"] != "T105_F023_A":
            raise ValueError("Unexpected NISAR date or frame")
        report["status"] = "EXPLORATORY_DERIVED_SINGLE"
    except Exception:
        # Signed URLs and API credentials must never appear in error messages.
        report["status"] = "FAILED"
        raise RuntimeError("The individual NISAR download or grid processing could not be completed") from None
    finally:
        shutil.rmtree(raw, ignore_errors=True)
        (out / "discovery.json").write_text(json.dumps(report, indent=2)+"\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", choices=tuple(EXPECTED), required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    run(args.date, args.out)
