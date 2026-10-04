"""
Parkfield Fault Displacement Data Pipeline
============================================
Fetches real ground-displacement data for the Parkfield segment of the San
Andreas Fault (location "E-01" / "Fault corridor A" in your project's
data/sample-data.json) and outputs it in the exact JSON schema defined in
lib/sample-schema.ts for the "earthquake" phenomenon (analysis: "displacement").

KEY ADVANTAGE OVER A RAW INSAR BUILD:
  Unlike the wetland pipeline (which computes backscatter from raw Sentinel-1
  scenes), this pipeline uses OPERA's DISP-S1 product — a pre-processed,
  already-unwrapped, analysis-ready surface displacement product. This means
  you do NOT need to do your own phase unwrapping, coherence masking, or
  atmospheric correction — NASA has already done it and validated it. This
  is by far the easier and lower-risk path for a real displacement story,
  which is exactly why Parkfield/Hayward (both in California, inside DISP-S1's
  coverage area) are good picks.

CONFIRMED REAL PRODUCT DETAILS:
  - Collection short name: OPERA_L3_DISP-S1_V1 (searchable via earthaccess)
  - Coverage: North America only (U.S./territories, Canada within 200km,
    Mexico, Central America) — Parkfield, CA is well within this.
  - Measures LINE-OF-SIGHT displacement only (toward/away from the
    satellite) — not full 3D motion. State this honestly in your pitch.
  - Units: meters of cumulative displacement relative to a reference date.

REQUIREMENTS:
  pip install earthaccess rasterio numpy

ACCOUNTS NEEDED:
  Free NASA Earthdata login: https://urs.earthdata.nasa.gov

USAGE:
  python parkfield_earthquake_pipeline.py --date 2024-09-10 --reference-date 2024-03-10 --dry-run
"""

import argparse
import json
import sys

try:
    import earthaccess
    import numpy as np
    import rasterio
except ImportError:
    print("Missing dependencies. Run: pip install earthaccess rasterio numpy")
    sys.exit(1)

# Real coordinates already cited in your project's data/sample-data.json
# (source: USGS NSMP Parkfield station page)
PARKFIELD_LAT = 35.8942
PARKFIELD_LON = -120.4212
BBOX_DEGREES = 0.15

# A simple transect (straight line) crossing the fault, used to build the
# displacementProfileCm array the schema expects. The San Andreas Fault
# near Parkfield runs roughly NW-SE, so a transect perpendicular to it
# (roughly NE-SW) is what you want to "see" fault-crossing displacement.
# These are placeholder endpoints — refine using a real fault trace map
# (USGS Quaternary Fault Database) before finalizing.
TRANSECT_START = (35.95, -120.48)  # (lat, lon)
TRANSECT_END = (35.84, -120.36)
TRANSECT_POINTS = 20  # number of sample points along the line


def search_disp_s1(date_str: str, reference_date: str):
    """
    Search for a real OPERA DISP-S1 granule covering Parkfield for the given
    date, compared against the given reference date.
    """
    earthaccess.login()
    results = earthaccess.search_data(
        short_name="OPERA_L3_DISP-S1_V1",
        bounding_box=(
            PARKFIELD_LON - BBOX_DEGREES, PARKFIELD_LAT - BBOX_DEGREES,
            PARKFIELD_LON + BBOX_DEGREES, PARKFIELD_LAT + BBOX_DEGREES,
        ),
        temporal=(reference_date, date_str),
    )
    print(f"Found {len(results)} DISP-S1 granule(s) between "
          f"{reference_date} and {date_str} over Parkfield.")
    return results


def download_disp_s1(results, out_dir="./data_raw/disp"):
    if not results:
        return []
    files = earthaccess.download(results, out_dir)
    return files


def extract_displacement_profile(displacement_tif_path: str):
    """
    Sample the displacement raster along TRANSECT_START -> TRANSECT_END,
    returning a list of {distanceKm, displacementCm} points matching the
    schema's ProfilePoint shape.

    Uses simple linear interpolation between the two endpoints and reads
    the nearest raster pixel at each sample point — adequate for a hackathon
    demo; a production tool would do proper bilinear resampling.
    """
    with rasterio.open(displacement_tif_path) as src:
        lat0, lon0 = TRANSECT_START
        lat1, lon1 = TRANSECT_END

        profile = []
        # Rough km-per-degree at this latitude, for distance labeling
        km_per_deg_lat = 111.0
        km_per_deg_lon = 111.0 * np.cos(np.radians((lat0 + lat1) / 2))

        for i in range(TRANSECT_POINTS):
            t = i / (TRANSECT_POINTS - 1)
            lat = lat0 + t * (lat1 - lat0)
            lon = lon0 + t * (lon1 - lon0)

            row, col = src.index(lon, lat)
            try:
                value_m = src.read(1)[row, col]
            except IndexError:
                continue  # point fell outside raster bounds

            if np.isnan(value_m):
                continue

            dist_km = np.sqrt(
                ((lat - lat0) * km_per_deg_lat) ** 2
                + ((lon - lon0) * km_per_deg_lon) ** 2
            )
            profile.append({
                "distanceKm": round(float(dist_km), 2),
                "displacementCm": round(float(value_m) * 100, 2),  # m -> cm
            })

    return profile


def build_acquisition_json(date_str, reference_date, profile, orbit, frame):
    """Assemble an Acquisition object for the earthquake phenomenon."""
    if profile:
        max_disp = max(abs(p["displacementCm"]) for p in profile)
        mean_disp = sum(p["displacementCm"] for p in profile) / len(profile)
    else:
        max_disp = mean_disp = 0.0

    return {
        "date": date_str,
        "referenceDate": reference_date,
        "backscatterNormalization": "gamma0",
        "histogramOrdinateUnit": "%",
        "areaUnit": "km\u00b2",
        "displacementSign": "positive_toward_sensor",
        "productType": "GUNW",
        "polarization": ["VV", "VH"],
        "orbit": orbit,
        "frame": frame,
        "passDirection": "ASCENDING",
        "productVersion": "real-pipeline-v1",
        "histogramBinsDb": [],  # not applicable to displacement analysis
        "displacementProfileCm": profile,
        "metrics": [
            {
                "id": "max-displacement",
                "label": "Max line-of-sight displacement",
                "value": round(max_disp, 2),
                "unit": "cm",
                "area": None,
                "provenance": "observed",
                "status": "NOMINAL" if max_disp < 5 else "WARN",
            },
            {
                "id": "mean-displacement",
                "label": "Mean line-of-sight displacement along transect",
                "value": round(mean_disp, 2),
                "unit": "cm",
                "area": None,
                "provenance": "derived",
                "status": "NOMINAL",
            },
        ],
        "insight": (
            f"Real OPERA DISP-S1 line-of-sight displacement for {date_str} "
            f"relative to {reference_date}, sampled along a transect "
            f"crossing the San Andreas Fault near Parkfield. Max observed: "
            f"{round(max_disp, 2)} cm. Note: line-of-sight only, not true "
            f"3D ground motion."
        ),
        "layerUrls": {"HH": None, "HV": None, "displacement": None},
        "tileUrl": None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--reference-date", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--merge-into", metavar="SAMPLE_DATA_JSON")
    args = parser.parse_args()

    results = search_disp_s1(args.date, args.reference_date)

    if args.dry_run or not results:
        print("Dry run complete, or no granules found. Try a different "
              "date range, or confirm your dates fall within DISP-S1's "
              "product record (coverage begins ~April 2024 per OPERA's "
              "release timeline).")
        return

    files = download_disp_s1(results)
    if not files:
        print("No files downloaded.")
        return

    profile = extract_displacement_profile(files[0])
    acquisition = build_acquisition_json(
        args.date, args.reference_date, profile, orbit=0, frame=0,
    )

    out_path = f"parkfield_acquisition_{args.date}.json"
    with open(out_path, "w") as f:
        json.dump(acquisition, f, indent=2)
    print(f"Wrote {out_path}")

    if args.merge_into:
        with open(args.merge_into) as f:
            data = json.load(f)
        quake = next(p for p in data["phenomena"] if p["id"] == "earthquake")
        location = next(loc for loc in quake["locations"] if loc["id"] == "E-01")
        with open(args.merge_into + ".bak", "w") as f:
            json.dump(data, f, indent=2)
        location["acquisitions"].append(acquisition)
        with open(args.merge_into, "w") as f:
            json.dump(data, f, indent=2)
        print(f"Merged into {args.merge_into} (backup at .bak)")


if __name__ == "__main__":
    main()
