"""Discover and optionally process a genuine coastal NISAR GCOV pair in GitHub Actions.

Never prints bearer tokens or signed download URLs. The selected products are
ephemeral; only derived review outputs are uploaded as workflow artifacts.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime
import json
import os
from pathlib import Path
import shutil

from pipeline.fetch_nisar import load_asf, search_kwargs, catalog_metadata, expected_size, product_filename, download_products
from pipeline.nisar_to_overlays import process_directory

AOI = (-93.55, 29.70, -93.35, 29.82)
MAX_PER_PRODUCT_BYTES = 2_500_000_000
MAX_TOTAL_BYTES = 5_000_000_000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=("discover", "process"), default="discover")
    ap.add_argument("--out", type=Path, default=Path("pipeline/coastal-review"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "site": "Cameron Parish, Louisiana",
        "roiWgs84": list(AOI),
        "source": "NASA NISAR L2 GCOV via ASF DAAC",
        "status": "DISCOVERY_REQUIRED",
        "interpretation": "Exploratory radar-backscatter change, NOT measured shoreline erosion",
        "selected": [],
    }
    report_file = args.out / "discovery.json"
    try:
        asf = load_asf()
        query_args = argparse.Namespace(bbox=AOI, start="2026-07-01",
                                        end="2026-11-14", track=None, frame=None,
                                        maturity="PROVISIONAL", max_results=200)
        products = list(asf.search(**search_kwargs(query_args, asf)))
        report["catalogResults"] = len(products)
        report["resultCapReached"] = len(products) >= 200
        groups = defaultdict(list)
        for p in products:
            prop = p.properties
            meta = catalog_metadata(p)
            try:
                filename = product_filename(p)
            except Exception:
                continue
            size = expected_size(prop, filename)
            if size is None or size <= 0 or size > MAX_PER_PRODUCT_BYTES:
                continue
            # Track/frame/pass/release must agree, not merely geographic overlap.
            key = (str(prop.get("pathNumber")), str(prop.get("frameNumber")),
                   str(prop.get("flightDirection")), str(meta.get("productVersion")),
                   str(meta.get("compositeReleaseId")), str(meta.get("dataMaturity")))
            try:
                date = str(prop["startTime"])[:10]
                datetime.fromisoformat(date)
            except (KeyError, ValueError):
                continue
            groups[key].append((date, p, size, filename))

        options = []
        for key, items in groups.items():
            items.sort(key=lambda x: x[0])
            for i, a in enumerate(items):
                for b in items[i + 1:]:
                    days = (datetime.fromisoformat(b[0]) - datetime.fromisoformat(a[0])).days
                    if 8 <= days <= 48 and a[2] + b[2] <= MAX_TOTAL_BYTES:
                        options.append((abs(days - 12), a[2] + b[2], a, b, key))
        report["compatibleMetadataPairsUnderSizeCap"] = len(options)
        if not options:
            report["status"] = "NO_VERIFIED_PAIR"
            report["reason"] = ("No same-track/frame/pass/version/maturity pair with disclosed "
                                "file sizes <= 2.5 GB each. Raw grids not downloaded.")
            print("No suitable pair found. See discovery.json.")
            return 0

        _, _, a, b, key = min(options, key=lambda x: (x[0], x[1]))
        pair = (a, b)
        report["selected"] = [
            {"date": x[0],
             "sceneName": x[1].properties.get("sceneName") or x[1].properties.get("fileID"),
             "bytes": x[2], "filename": x[3],
             "track": key[0], "frame": key[1], "pass": key[2],
             "productVersion": key[3], "compositeReleaseId": key[4],
             "dataMaturity": key[5]} for x in pair
        ]
        report["status"] = "METADATA_PAIR_CANDIDATE"
        print("Found metadata-compatible candidate; scientific grid checks still required.")
        if args.mode == "discover":
            return 0

        if not os.environ.get("EARTHDATA_TOKEN"):
            report["status"] = "AUTHENTICATION_REQUIRED"
            print("EARTHDATA_TOKEN secret is not available to this run.")
            return 2

        # Avoid GitHub hosted runner disk exhaustion before downloading.
        available = shutil.disk_usage(args.out).free
        total = a[2] + b[2]
        if available < total + 2_000_000_000:
            report["status"] = "INSUFFICIENT_RUNNER_STORAGE"
            print("Not enough temporary disk space for both HDF5 products and derivatives.")
            return 2

        raw = args.out / "downloads"
        download_products([a[1], b[1]], raw, asf)
        report["status"] = "DOWNLOADED"
        manifest = process_directory(raw, args.out / "processed", aoi=AOI,
                                     pols=("HHHH", "HVHV"), max_size=2048,
                                     png_quantize=True)
        frames = manifest.get("frames", [])
        if not any(len(frame.get("changeLayers", [])) >= 2 for frame in frames):
            raise ValueError("No real paired difference grids were produced")
        report["status"] = "EXPLORATORY_PROCESSED_NOT_QA_CLEARED"
        report["frames"] = [f.get("id") for f in frames]
        print("Generated genuine NISAR imagery and numeric raster derivatives.")
        return 0
    except Exception as e:
        report["status"] = "FAILED"
        # Keep third-party exception messages out of logs and artifacts: signed URLs could leak.
        report["reason"] = "Pipeline/search/download validation failed; inspect masked job logs."
        print("Coastal pair processing did not complete. See status and workflow step.")
        return 2
    finally:
        report_file.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
