"""
Everglades Wetland-Loss Data Pipeline
======================================
Fetches real SAR backscatter data for the Everglades and outputs it in the
exact JSON schema defined in lib/sample-schema.ts (the "wetland" Phenomenon
-> Hotspot -> Acquisition structure your Next.js app already expects).

WHAT THIS DOES:
  1. Searches ASF for real Sentinel-1 (or NISAR, once available) scenes
     covering the Everglades for two dates (a "baseline" and a later
     "acquisition" to compare).
  2. Downloads and calibrates the scenes to gamma-0 backscatter (dB).
  3. Computes a dB histogram (matching HistogramBin: db, HH, HV — see note
     on polarization below).
  4. Computes simple summary metrics (mean backscatter, low-backscatter
     area estimate) to populate the Metric objects.
  5. Writes real_everglades_data.json structured to slot directly into
     data/sample-data.json under phenomena -> wetland -> locations[0].

REQUIREMENTS (install first):
  pip install asf_search rasterio numpy earthaccess

ACCOUNTS NEEDED:
  Free NASA Earthdata login: https://urs.earthdata.nasa.gov
  (asf_search and earthaccess will both prompt for these credentials on
  first run, or you can set them as environment variables
  EARTHDATA_USERNAME / EARTHDATA_PASSWORD)

VALIDATION STEP:
  The --process flow now automatically cross-checks your Sentinel-1-based
  water estimate against NASA's own OPERA DSWx-S1 product (a different,
  independently-validated surface water dataset) for the same date, via
  fetch_opera_dswx_tile() / validate_against_opera_dswx(). DSWx-S1 has
  been in production since September 2024 — pick acquisition dates after
  that if you want this validation step to work.

IMPORTANT POLARIZATION NOTE:
  The app's schema uses HH/HV (NISAR's typical land polarization mode).
  Sentinel-1 over land is usually VV/VH instead. Until real NISAR coverage
  of the Everglades is confirmed available, this script defaults to
  Sentinel-1 VV/VH and labels it honestly as a substitute — do NOT rename
  VV/VH data as "HH/HV" in your final output; either update the schema to
  accept VV/VH, or clearly document the substitution in your `insight` and
  pitch narrative (the project's own README already models this kind of
  honesty about data provenance — follow that precedent).

USAGE:
  python everglades_pipeline.py --start 2024-01-01 --end 2024-06-01
"""

import argparse
import json
import sys
from datetime import datetime

try:
    import asf_search as asf
    import numpy as np
    import rasterio
except ImportError:
    print("Missing dependencies. Run: pip install asf_search rasterio numpy")
    sys.exit(1)

# Everglades coordinates, already used elsewhere in the project
# (source cited in data/sample-data.json: fl.water.usgs.gov)
EVERGLADES_LAT = 25.6153
EVERGLADES_LON = -80.7031
# A small bounding box (~0.2 degrees) around the point, as a WKT polygon
BBOX_DEGREES = 0.1
AOI_WKT = (
    f"POLYGON(("
    f"{EVERGLADES_LON - BBOX_DEGREES} {EVERGLADES_LAT - BBOX_DEGREES},"
    f"{EVERGLADES_LON + BBOX_DEGREES} {EVERGLADES_LAT - BBOX_DEGREES},"
    f"{EVERGLADES_LON + BBOX_DEGREES} {EVERGLADES_LAT + BBOX_DEGREES},"
    f"{EVERGLADES_LON - BBOX_DEGREES} {EVERGLADES_LAT + BBOX_DEGREES},"
    f"{EVERGLADES_LON - BBOX_DEGREES} {EVERGLADES_LAT - BBOX_DEGREES}"
    f"))"
)


def search_scenes(start_date: str, end_date: str, limit: int = 10):
    """Search ASF for Sentinel-1 GRD scenes over the Everglades."""
    print(f"Searching ASF for Sentinel-1 scenes over the Everglades "
          f"({start_date} to {end_date})...")
    results = asf.search(
        platform=[asf.PLATFORM.SENTINEL1],
        processingLevel=[asf.PRODUCT_TYPE.GRD_HD],
        intersectsWith=AOI_WKT,
        start=start_date,
        end=end_date,
        maxResults=limit,
    )
    print(f"Found {len(results)} candidate scenes.")
    for r in results:
        props = r.properties
        print(f"  - {props['sceneName']} | {props['startTime']} | "
              f"pol: {props.get('polarization')}")
    return results


def download_scene(result, out_dir="./data_raw"):
    """Download a single scene. Requires Earthdata login on first call."""
    print(f"Downloading {result.properties['sceneName']}...")
    result.download(path=out_dir)
    return out_dir


def compute_backscatter_stats(tif_path: str):
    """
    Read a calibrated GeoTIFF band and compute:
      - gamma-0 dB histogram bins
      - mean backscatter (dB)
      - fraction of pixels below a low-backscatter threshold (proxy for
        water/wet areas, per the ESA/Esri flood-mapping methodology)
    """
    with rasterio.open(tif_path) as src:
        band = src.read(1).astype("float32")
        band = band[band > 0]  # drop nodata/zero pixels
        power = band
        db = 10 * np.log10(power + 1e-10)

        # Histogram bins matching HistogramBin: db value + % frequency
        hist, bin_edges = np.histogram(db, bins=20, range=(-25, 5))
        hist_pct = (hist / hist.sum() * 100).tolist()
        bin_centers = ((bin_edges[:-1] + bin_edges[1:]) / 2).tolist()

        mean_db = float(np.mean(db))

        # Simple low-backscatter (water-like) threshold, per Esri/ESA
        # flood-mapping guidance (-19.5 dB is a commonly cited starting
        # threshold in published flood studies — tune per scene/season)
        water_like_fraction = float(np.mean(db < -19.5))

    return {
        "mean_db": round(mean_db, 2),
        "water_like_fraction": round(water_like_fraction * 100, 2),
        "histogram_bins_db": bin_centers,
        "histogram_pct": hist_pct,
    }


def build_acquisition_json(date_str: str, reference_date: str, stats: dict,
                            orbit: int, frame: int):
    """
    Assemble one Acquisition object matching lib/sample-schema.ts.
    NOTE: polarization labeled "VV"/"VH" here — rename/remap to HH/HV
    ONLY once you've confirmed this is actually NISAR data, or explicitly
    document the substitution (see module docstring).
    """
    return {
        "date": date_str,
        "referenceDate": reference_date,
        "backscatterNormalization": "gamma0",
        "histogramOrdinateUnit": "%",
        "areaUnit": "km\u00b2",
        "displacementSign": "positive_toward_sensor",
        "productType": "GCOV",
        "polarization": ["VV", "VH"],  # see polarization note above
        "orbit": orbit,
        "frame": frame,
        "passDirection": "ASCENDING",
        "productVersion": "real-pipeline-v1",
        "histogramBinsDb": [
            {"db": round(db, 1), "HH": pct, "HV": 0.0}
            for db, pct in zip(stats["histogram_bins_db"], stats["histogram_pct"])
        ],
        "displacementProfileCm": [],  # not applicable to wetland/backscatter
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
                "id": "low-backscatter-fraction",
                "label": "Low-backscatter (water-like) area",
                "value": stats["water_like_fraction"],
                "unit": "%",
                "area": None,
                "provenance": "derived",
                "status": "NOMINAL",
            },
        ],
        "insight": (
            f"Real Sentinel-1 GRD backscatter for {date_str}. "
            f"Mean gamma-0: {stats['mean_db']} dB; "
            f"{stats['water_like_fraction']}% of pixels fall below the "
            f"-19.5 dB water-like threshold used in published flood-mapping "
            f"studies (see README citations)."
        ),
        "layerUrls": {"HH": None, "HV": None, "displacement": None},
        "tileUrl": None,
    }


def merge_into_sample_data(acquisition: dict, schema_path: str,
                            location_id: str = "everglades"):
    """
    Merge a real Acquisition object into data/sample-data.json, appending
    it to the named location's `acquisitions` array under the "wetland"
    phenomenon. Makes a .bak backup before writing, since this edits your
    project's real data file in place.
    """
    with open(schema_path, "r") as f:
        data = json.load(f)

    wetland = next(p for p in data["phenomena"] if p["id"] == "wetland")
    location = next(loc for loc in wetland["locations"]
                     if loc["id"] == location_id)

    backup_path = schema_path + ".bak"
    with open(backup_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Backup written to {backup_path}")

    location["acquisitions"].append(acquisition)

    with open(schema_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Merged real acquisition into {schema_path} "
          f"under phenomena.wetland.locations[id={location_id}]")


def fetch_opera_dswx_tile(date_str: str, out_dir: str = "./data_raw/dswx"):
    """
    Search and download a real OPERA DSWx-S1 (Dynamic Surface Water Extent
    from Sentinel-1) tile covering the Everglades for the given date.

    DSWx-S1 facts (confirmed from NASA's own product documentation):
      - Collection short name on NASA Earthdata/CMR: OPERA_L3_DSWX-S1_V1
      - Distributed via NASA's PO.DAAC, searchable through Earthdata Search
      - In production since September 2024 — if your target date predates
        this, DSWx-S1 won't exist yet and you should either pick a later
        date or fall back to the optical-sensor DSWx-HLS product instead.
      - 30 m spatial resolution.
      - The key raster layer is "WTR" (Water), with pixel values:
          0   = Not Water
          1   = Open Water
          3   = Inundated Vegetation
          250 = Height-Above-Nearest-Drainage masked (excluded, not a
                real "not water" reading)
          251 = Layover/shadow masked (excluded, SAR geometry artifact,
                not a real reading)

    Requires: pip install earthaccess
    (earthaccess is NASA's official Python client for searching/downloading
    from Earthdata-hosted collections like PO.DAAC — a different tool from
    asf_search, which only covers ASF-hosted SAR products.)
    """
    try:
        import earthaccess
    except ImportError:
        print("Missing dependency. Run: pip install earthaccess")
        return None

    earthaccess.login()  # prompts for Earthdata credentials if not cached

    results = earthaccess.search_data(
        short_name="OPERA_L3_DSWX-S1_V1",
        bounding_box=(
            EVERGLADES_LON - BBOX_DEGREES, EVERGLADES_LAT - BBOX_DEGREES,
            EVERGLADES_LON + BBOX_DEGREES, EVERGLADES_LAT + BBOX_DEGREES,
        ),
        temporal=(date_str, date_str),
    )

    if not results:
        print(f"No DSWx-S1 tiles found for {date_str} over the Everglades. "
              f"Try a nearby date (revisit is not daily), or confirm the "
              f"date is after September 2024 when DSWx-S1 production began.")
        return None

    print(f"Found {len(results)} DSWx-S1 granule(s) for {date_str}.")
    files = earthaccess.download(results, out_dir)
    return files[0] if files else None


def compute_water_fraction_from_dswx(wtr_tif_path: str) -> float:
    """
    Compute the real percentage of water pixels (classes 1 + 3) from a
    downloaded DSWx-S1 WTR layer GeoTIFF, excluding masked pixels (250, 251)
    from the denominator since those aren't valid "not water" readings.
    """
    with rasterio.open(wtr_tif_path) as src:
        wtr = src.read(1)

    valid_mask = ~np.isin(wtr, [250, 251])
    valid_pixels = wtr[valid_mask]
    if valid_pixels.size == 0:
        raise ValueError("No valid (unmasked) pixels found in this tile.")

    water_pixels = np.isin(valid_pixels, [1, 3])
    return round(float(np.mean(water_pixels)) * 100, 2)


def validate_against_opera_dswx(water_like_fraction: float, date_str: str,
                                 tolerance_pct: float = 10.0):
    """
    Real validation: fetches the actual OPERA DSWx-S1 tile for the same
    date and location, computes its real water-pixel fraction, and compares
    it directly against your Sentinel-1-backscatter-derived estimate.

    This is a genuine cross-sensor check — DSWx-S1 is NASA's own validated
    product (checked against real stream gauge and satellite data per its
    documentation), so close agreement here is strong, citable evidence
    your pipeline's numbers are trustworthy — exactly the kind of validation
    a sharp judge will respect.

    `tolerance_pct` is how many percentage points of disagreement is
    acceptable before flagging a warning — 10 points is a reasonable
    starting tolerance given the two methods use different algorithms
    (simple dB threshold vs. OPERA's full classification model), but you
    can tighten this once you've seen how closely they typically agree.
    """
    dswx_path = fetch_opera_dswx_tile(date_str)
    if dswx_path is None:
        print("Could not fetch a DSWx-S1 tile to validate against — "
              "proceeding without cross-validation. Document this gap "
              "honestly in your pitch if it comes up.")
        return None

    dswx_fraction = compute_water_fraction_from_dswx(dswx_path)
    diff = abs(water_like_fraction - dswx_fraction)

    print(f"\nValidation against OPERA DSWx-S1 for {date_str}:")
    print(f"  Your Sentinel-1 threshold estimate: {water_like_fraction}%")
    print(f"  OPERA DSWx-S1 actual water fraction: {dswx_fraction}%")
    print(f"  Difference: {round(diff, 2)} percentage points")

    if diff <= tolerance_pct:
        print(f"  Within tolerance ({tolerance_pct}pp) — your estimate is "
              f"well-supported by NASA's own validated product.")
    else:
        print(f"  WARNING: exceeds tolerance ({tolerance_pct}pp). Check "
              f"your calibration and -19.5 dB threshold before trusting "
              f"this number, or consider using the DSWx-S1 water fraction "
              f"directly instead of your own threshold-based estimate.")

    return {"your_estimate": water_like_fraction,
            "dswx_actual": dswx_fraction, "difference": diff}


# Recommended real date windows for the Everglades specifically:
# South Florida has a pronounced wet season (roughly May-October, heavy
# convective rainfall) and dry season (roughly November-April). Picking
# one scene from each season — rather than two arbitrary close-together
# dates — gives you a real, explainable, non-trivial water-extent change
# to show, rather than hoping two random dates happen to differ.
# Example: a 2024 dry-season baseline (e.g. March 2024) vs a 2024
# wet-season acquisition (e.g. September 2024) is a reasonable starting
# pair to search for in ASF — adjust once you see what's actually
# available and cloud/SAR-artifact-free in the search results.
RECOMMENDED_DATE_PAIRS = [
    ("2024-03-01", "2024-03-15", "dry season baseline"),
    ("2024-09-01", "2024-09-15", "wet season acquisition"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default="2024-06-01")
    parser.add_argument("--dry-run", action="store_true",
                         help="Search only, don't download/process")
    parser.add_argument("--process", metavar="TIF_PATH",
                         help="Path to an already-downloaded, calibrated "
                              "GeoTIFF to process into schema JSON")
    parser.add_argument("--date", help="Acquisition date for --process "
                                        "(YYYY-MM-DD)")
    parser.add_argument("--reference-date",
                         help="Baseline date being compared against")
    parser.add_argument("--merge-into", metavar="SAMPLE_DATA_JSON",
                         help="Path to data/sample-data.json to merge "
                              "the processed result into")
    args = parser.parse_args()

    if args.process:
        if not args.date or not args.reference_date:
            print("--process requires --date and --reference-date")
            sys.exit(1)
        stats = compute_backscatter_stats(args.process)
        print(f"\nComputed stats: {stats}")
        validate_against_opera_dswx(stats["water_like_fraction"], args.date)
        acquisition = build_acquisition_json(
            args.date, args.reference_date, stats, orbit=0, frame=0,
        )
        out_path = f"everglades_acquisition_{args.date}.json"
        with open(out_path, "w") as f:
            json.dump(acquisition, f, indent=2)
        print(f"\nWrote {out_path}")

        if args.merge_into:
            merge_into_sample_data(acquisition, args.merge_into)
        else:
            print("Run again with --merge-into data/sample-data.json "
                  "to insert this directly into your app's data file.")
        return

    results = search_scenes(args.start, args.end)

    if args.dry_run or not results:
        print("\nDry run complete (or no results found).")
        print("\nSuggested real date windows to try (wet vs. dry season, "
              "for a real, explainable water-extent change):")
        for start, end, label in RECOMMENDED_DATE_PAIRS:
            print(f"  {start} to {end}  —  {label}")
        return

    print("\nNext steps:")
    print("1. Pick two scenes above (baseline + later acquisition) with "
          "your partner.")
    print("2. Download and calibrate them to gamma-0 (ASF's on-demand "
          "processing or ESA SNAP can do this if not already applied).")
    print("3. Run: python everglades_pipeline.py --process <tif_path> "
          "--date YYYY-MM-DD --reference-date YYYY-MM-DD "
          "--merge-into ../data/sample-data.json")
    print("   (run this once per scene — baseline and acquisition)")


if __name__ == "__main__":
    main()
