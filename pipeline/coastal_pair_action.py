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

SITES = {
    "cameron": (-93.55, 29.70, -93.35, 29.82),
    "isles-dernieres": (-90.95, 29.03, -90.72, 29.16),
    "chandeleur": (-88.87, 29.65, -88.70, 29.88),
    "rodanthe": (-75.50, 35.53, -75.43, 35.64),
    "cape-hatteras": (-75.62, 35.18, -75.48, 35.29),
    "amazon-mamiraua": (-65.02, -3.30, -64.75, -3.08),
    "amazon-manaus": (-60.15, -3.26, -59.87, -3.04),
    "amazon-santarem": (-54.91, -2.60, -54.63, -2.39),
}
AOI = SITES["cameron"]
MAX_PER_PRODUCT_BYTES = 2_800_000_000
MAX_TOTAL_BYTES = 5_600_000_000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=("discover", "process"), default="discover")
    ap.add_argument("--site", choices=tuple(SITES), default="cameron")
    ap.add_argument("--out", type=Path, default=Path("pipeline/coastal-review"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    aoi = SITES[args.site]
    report: dict = {
        "site": args.site,
        "roiWgs84": list(aoi),
        "source": "NASA NISAR L2 GCOV via ASF DAAC",
        "status": "DISCOVERY_REQUIRED",
        "interpretation": "Longer interval exploratory radar-backscatter change, NOT measured shoreline erosion",
        "selected": [],
    }
    report_file = args.out / "discovery.json"
    try:
        asf = load_asf()
        query_args = argparse.Namespace(bbox=aoi, start="2026-07-01",
                                        end="2026-11-14", track=None, frame=None,
                                        maturity="PROVISIONAL", max_results=200)
        products = list(asf.search(**search_kwargs(query_args, asf)))
        report["catalogResults"] = len(products)
        report["catalogInventory"] = [
            {
                "date": str(p.properties.get("startTime", ""))[:10],
                "track": p.properties.get("pathNumber"),
                "frame": p.properties.get("frameNumber"),
                "direction": p.properties.get("flightDirection"),
                "sizeGB": round((expected_size(p.properties, product_filename(p)) or 0) / 1e9, 3),
                "release": catalog_metadata(p).get("compositeReleaseId"),
            }
            for p in products
        ]
        report["resultCapReached"] = len(products) >= 200
        groups = defaultdict(list)
        report["sizeKnownProducts"] = 0
        report["sizeWithinLimitProducts"] = 0
        report["sceneNamesSample"] = []
        for p in products:
            prop = p.properties
            meta = catalog_metadata(p)
            try:
                filename = product_filename(p)
            except Exception:
                continue
            # This processor requires Frequency-A HHHH and HVHV.
            # Same track/frame can still have incompatible acquisition modes.
            if "_DHDH_A_" not in filename:
                continue
            size = expected_size(prop, filename)
            if len(report["sceneNamesSample"]) < 5:
                report["sceneNamesSample"].append({
                    "date": str(prop.get("startTime", ""))[:10],
                    "track": prop.get("pathNumber"),
                    "frame": prop.get("frameNumber"),
                    "pass": prop.get("flightDirection"),
                    "sizeKnown": size is not None,
                    "sizeGB": round(size / 1e9, 2) if size else None,
                    "maturity": meta.get("dataMaturity")
                })
            if size is not None:
                report["sizeKnownProducts"] += 1
                if size <= MAX_PER_PRODUCT_BYTES:
                    report["sizeWithinLimitProducts"] += 1
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
                    if 8 <= days <= 120 and a[2] + b[2] <= MAX_TOTAL_BYTES:
                        options.append((abs(days - 12), a[2] + b[2], a, b, key))
        report["compatibleMetadataPairsUnderSizeCap"] = len(options)
        if not options:
            report["status"] = "NO_VERIFIED_PAIR"
            report["reason"] = ("No same-track/frame/pass/version/maturity pair with disclosed "
                                "file sizes <= 2.8 GB each. Raw grids not downloaded.")
            print("No suitable pair found. See discovery.json.")
            return 0

        # Prioritize a real before/after acquisition around the documented
        # 23–27 September 2026 Outer Banks nor'easter when available.
        storm_pairs = [opt for opt in options
                       if args.site == "rodanthe" and
                       opt[2][0] == "2026-07-07" and opt[3][0] == "2026-10-11"]
        _, _, a, b, key = min(storm_pairs or options, key=lambda x: (x[0], x[1]))
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
        manifest = process_directory(raw, args.out / "processed", aoi=aoi,
                                     pols=("HHHH", "HVHV"), max_size=2048,
                                     png_quantize=True)
        frames = manifest.get("frames", [])
        if not any(len(frame.get("changeLayers", [])) >= 2 for frame in frames):
            raise ValueError("No real paired difference grids were produced")
        report["status"] = "EXPLORATORY_PROCESSED_NOT_QA_CLEARED"
        report["frames"] = [f.get("id") for f in frames]
        print("Generated genuine NISAR imagery and numeric raster derivatives.")
        return 0
    except Exception:
        report["status"] = "FAILED"
        # Keep third-party exception messages out of logs and artifacts: signed URLs could leak.
        report["reason"] = "Pipeline/search/download validation failed; inspect masked job logs."
        print("Coastal pair processing did not complete. See status and workflow step.")
        return 2
    finally:
        report_file.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
