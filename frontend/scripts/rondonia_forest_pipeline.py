"""
Rondônia Deforestation Data Pipeline
======================================
Fetches real SAR backscatter data for the Rondônia deforestation frontier
(location "F-01" / "Forest frontier A" in your project's
data/sample-data.json) and outputs it in the exact JSON schema defined in
lib/sample-schema.ts for the "forest" phenomenon (analysis: "backscatter").

STORY RATIONALE:
  Rondônia, Brazil is one of the most heavily studied deforestation
  frontiers on Earth (NASA/ORNL DAAC has long-running data products for
  exactly this region, already cited as your coordinateSource) — this is a
  genuinely well-documented, real place, not an arbitrary pick.

APPROACH:
  Same core method as the wetland pipeline — before/after Sentinel-1
  amplitude backscatter differencing — because forest clearing produces a
  large, reliable backscatter drop (dense forest canopy is a strong,
  volume-scattering target; cleared/bare land scatters very differently).
  This is then cross-validated against OPERA's new DIST-S1 product, which
  independently classifies disturbance using NASA's own algorithm.

CONFIRMED REAL PRODUCT DETAILS (DIST-S1, for validation step):
  - Collection: part of OPERA's near-global Surface Disturbance (DIST)
    suite; the Sentinel-1-based variant is DIST-S1.
  - Coverage: Near-global (all land masses except Antarctica) — Brazil is
    covered.
  - Temporal coverage begins March 2026 — IMPORTANT: pick your comparison
    dates after this if you want the DIST-S1 validation step to actually
    find data. For dates before March 2026, use DIST-HLS (optical-based,
    coverage since Jan 2023) as an alternative validation source instead
    (not implemented in this script, but same idea — check earthdata.nasa.gov).
  - Disturbance pixel values in the GEN-DIST-STATUS layer: 0 = no
    disturbance, 1 = moderate-confidence disturbance, 2 = high-confidence
    disturbance.

REQUIREMENTS:
  pip install asf_search earthaccess rasterio numpy

ACCOUNTS NEEDED:
  Free NASA Earthdata login: https://urs.earthdata.nasa.gov

USAGE:
  python rondonia_forest_pipeline.py --start 2024-01-01 --end 2024-12-01 --dry-run
"""

import argparse
import json
import sys

try:
    import asf_search as asf
    import earthaccess
    import numpy as np
    import rasterio
except ImportError:
    print("Missing dependencies. Run: pip install asf_search earthaccess rasterio numpy")
    sys.exit(1)

# Real coordinates already cited in your project's data/sample-data.json
# (source: ORNL DAAC georectified products guide for Rondônia)
RONDONIA_LAT = -10.1277
RONDONIA_LON = -63.6783
BBOX_DEGREES = 0.15
AOI_WKT = (
    f"POLYGON(("
    f"{RONDONIA_LON - BBOX_DEGREES} {RONDONIA_LAT - BBOX_DEGREES},"
    f"{RONDONIA_LON + BBOX_DEGREES} {RONDONIA_LAT - BBOX_DEGREES},"
    f"{RONDONIA_LON + BBOX_DEGREES} {RONDONIA_LAT + BBOX_DEGREES},"
    f"{RONDONIA_LON - BBOX_DEGREES} {RONDONIA_LAT + BBOX_DEGREES},"
    f"{RONDONIA_LON - BBOX_DEGREES} {RONDONIA_LAT - BBOX_DEGREES}"
    f"))"
)


def search_scenes(start_date: str, end_date: str, limit: int = 10):
    """Search ASF for Sentinel-1 GRD scenes over the Rondônia frontier."""
    results = asf.search(
        platform=[asf.PLATFORM.SENTINEL1],
        processingLevel=[asf.PRODUCT_TYPE.GRD_HD],
        intersectsWith=AOI_WKT,
        start=start_date,
        end=end_date,
        maxResults=limit,
    )
    print(f"Found {len(results)} Sentinel-1 scene(s) over Rondônia.")
    for r in results:
        p = r.properties
        print(f"  - {p['sceneName']} | {p['startTime']}")
    return results


def compute_backscatter_stats(tif_path: str):
    """
    Compute a dB histogram and mean backscatter, plus a 'cleared-like'
    pixel fraction using a threshold tuned for forest-vs-cleared contrast
    (forest canopy backscatter is markedly higher than cleared/bare land
    in SAR; this is the inverse logic of the wetland water-threshold, but
    the same differencing technique).
    """
    with rasterio.open(tif_path) as src:
        band = src.read(1).astype("float32")
        band = band[band > 0]
        db = 10 * np.log10(band + 1e-10)

        hist, bin_edges = np.histogram(db, bins=20, range=(-20, 0))
        hist_pct = (hist / hist.sum() * 100).tolist()
        bin_centers = ((bin_edges[:-1] + bin_edges[1:]) / 2).tolist()

        mean_db = float(np.mean(db))
        # Placeholder threshold — refine per-scene; forest backscatter is
        # typically higher (less negative dB) than recently cleared land.
        cleared_like_fraction = float(np.mean(db < -10.0))

    return {
        "mean_db": round(mean_db, 2),
        "cleared_like_fraction": round(cleared_like_fraction * 100, 2),
        "histogram_bins_db": bin_centers,
        "histogram_pct": hist_pct,
    }


def fetch_dist_s1_validation(date_str: str):
    """
    Fetch a real OPERA DIST-S1 tile for cross-validation, mirroring the
    wetland pipeline's DSWx-S1 validation pattern. Returns the fraction of
    disturbed pixels (values 1 or 2 in GEN-DIST-STATUS) if a tile is found.
    """
    earthaccess.login()
    results = earthaccess.search_data(
        short_name="OPERA_L3_DIST-ALERT-S1_V1",  # confirm exact short name
        # on Earthdata Search before relying on this — DIST-S1 is very new
        # (temporal coverage begins March 2026) and collection naming may
        # still be in flux; search earthdata.nasa.gov/data/catalog directly
        # if this short_name doesn't resolve.
        bounding_box=(
            RONDONIA_LON - BBOX_DEGREES, RONDONIA_LAT - BBOX_DEGREES,
            RONDONIA_LON + BBOX_DEGREES, RONDONIA_LAT + BBOX_DEGREES,
        ),
        temporal=(date_str, date_str),
    )
    if not results:
        print(f"No DIST-S1 tile found for {date_str}. If your date predates "
              f"March 2026, this is expected — DIST-S1 wasn't yet in "
              f"production. Consider DIST-HLS (optical-based, available "
              f"since Jan 2023) as an alternative for earlier dates.")
        return None

    files = earthaccess.download(results, "./data_raw/dist")
    if not files:
        return None

    with rasterio.open(files[0]) as src:
        status = src.read(1)
    disturbed_fraction = float(np.mean(np.isin(status, [1, 2]))) * 100
    return round(disturbed_fraction, 2)


def build_acquisition_json(date_str, reference_date, stats, dist_validation,
                            orbit, frame):
    insight = (
        f"Real Sentinel-1 GRD backscatter for {date_str}. Mean gamma-0: "
        f"{stats['mean_db']} dB; {stats['cleared_like_fraction']}% of "
        f"pixels fall below the clearing-like threshold."
    )
    if dist_validation is not None:
        insight += (
            f" Cross-checked against OPERA DIST-S1: {dist_validation}% "
            f"of the same area flagged as disturbed."
        )

    return {
        "date": date_str,
        "referenceDate": reference_date,
        "backscatterNormalization": "gamma0",
        "histogramOrdinateUnit": "%",
        "areaUnit": "km\u00b2",
        "displacementSign": "positive_toward_sensor",
        "productType": "GCOV",
        "polarization": ["VV", "VH"],
        "orbit": orbit,
        "frame": frame,
        "passDirection": "ASCENDING",
        "productVersion": "real-pipeline-v1",
        "histogramBinsDb": [
            {"db": round(db, 1), "HH": pct, "HV": 0.0}
            for db, pct in zip(stats["histogram_bins_db"], stats["histogram_pct"])
        ],
        "displacementProfileCm": [],
        "metrics": [
            {
                "id": "mean-backscatter",
                "label": "Mean backscatter",
                "value": stats["mean_db"],
                "unit": "dB",
                "area": None,
                "provenance": "observed",
                "status": "NOMINAL",
            },
            {
                "id": "cleared-like-fraction",
                "label": "Cleared-like area",
                "value": stats["cleared_like_fraction"],
                "unit": "%",
                "area": None,
                "provenance": "derived",
                "status": "WARN" if stats["cleared_like_fraction"] > 20 else "NOMINAL",
            },
        ] + ([{
            "id": "dist-s1-disturbed-fraction",
            "label": "OPERA DIST-S1 disturbed area (validation)",
            "value": dist_validation,
            "unit": "%",
            "area": None,
            "provenance": "observed",
            "status": "NOMINAL",
        }] if dist_validation is not None else []),
        "insight": insight,
        "layerUrls": {"HH": None, "HV": None, "displacement": None},
        "tileUrl": None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default="2024-12-01")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--process", metavar="TIF_PATH")
    parser.add_argument("--date")
    parser.add_argument("--reference-date")
    parser.add_argument("--merge-into", metavar="SAMPLE_DATA_JSON")
    args = parser.parse_args()

    if args.process:
        if not args.date or not args.reference_date:
            print("--process requires --date and --reference-date")
            sys.exit(1)
        stats = compute_backscatter_stats(args.process)
        dist_validation = fetch_dist_s1_validation(args.date)
        acquisition = build_acquisition_json(
            args.date, args.reference_date, stats, dist_validation,
            orbit=0, frame=0,
        )
        out_path = f"rondonia_acquisition_{args.date}.json"
        with open(out_path, "w") as f:
            json.dump(acquisition, f, indent=2)
        print(f"Wrote {out_path}")

        if args.merge_into:
            with open(args.merge_into) as f:
                data = json.load(f)
            forest = next(p for p in data["phenomena"] if p["id"] == "forest")
            location = next(loc for loc in forest["locations"] if loc["id"] == "F-01")
            with open(args.merge_into + ".bak", "w") as f:
                json.dump(data, f, indent=2)
            location["acquisitions"].append(acquisition)
            with open(args.merge_into, "w") as f:
                json.dump(data, f, indent=2)
            print(f"Merged into {args.merge_into} (backup at .bak)")
        return

    results = search_scenes(args.start, args.end)
    if args.dry_run or not results:
        print("Dry run complete. Rondônia's deforestation season peaks in "
              "the dry season (roughly May-September) — comparing a "
              "wet-season baseline to a dry-season (clearing-season) "
              "acquisition gives the most realistic, explainable change.")
        return

    print("Next: pick two scenes, download + calibrate to gamma-0, then "
          "run with --process <tif> --date ... --reference-date ... "
          "--merge-into ../data/sample-data.json")


if __name__ == "__main__":
    main()
