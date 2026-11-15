"""Generate Everglades-compatible review packages from *existing* real GCOV GeoTIFFs.

Never downloads source data; never invents pixels. Statistics are calculated on
the reduced, georeferenced analysis grids in each published manifest. Selected
A/B/C windows are exploratory, not independently interpreted environmental
objects. Input HDF5-level QA remains unverified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.warp import transform as project

SITES = {
    "rodanthe": {"title": "Rodanthe, North Carolina", "region": "North Carolina Outer Banks coast", "data": "rodanthe-processed"},
    "custom": {"title": "Custom NISAR coordinate comparison", "region": "Visitor-selected geographic point", "data": "results"},
    "hawaii-full": {"title": "Kīlauea, Hawaiʻi", "region": "Kīlauea volcanic summit, Hawaiʻi, United States", "data": "hawaii-processed"},
    "iowa-full": {"title": "Ames, Iowa", "region": "Ames, Iowa, United States", "data": "iowa-processed"},
    "amazon": {"title": "Mamirauá, Amazon River", "region": "Mamirauá Amazon River floodplain, Brazil", "data": "amazon-mamiraua"},
}
RANGES = {"HH": (-25., 0.), "HV": (-30., -5.)}
CLEARANCE = "NOT CLEARED FOR QUANTITATIVE ANALYSIS"
QA = "EXPLORATORY_NOT_CLEARED"


def save(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def read_raster(path):
    with rasterio.open(path) as ds:
        a = ds.read(1).astype("float64")
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
        return a, ds.crs, ds.transform


def obs(values, date, granule, limits, bins):
    v = values[np.isfinite(values)]
    if not v.size:
        raise ValueError("Empty observation")
    counts, _ = np.histogram(v, bins=bins)
    return ({
        "date": date, "granuleId": granule, "count": int(v.size),
        "meanDb": float(np.mean(v)), "medianDb": float(np.median(v)),
        "stdDb": float(np.std(v)), "p05Db": float(np.percentile(v, 5)),
        "p95Db": float(np.percentile(v, 95)),
        "outsideDisplayRange": int(v.size - counts.sum()),
    }, counts)


def corners(transform, shape, crs, row0, row1, col0, col1):
    xy = [transform * (col, row) for col, row in
          [(col0, row0), (col1, row0), (col1, row1), (col0, row1), (col0, row0)]]
    lons, lats = project(crs, "EPSG:4326", [v[0] for v in xy], [v[1] for v in xy])
    return [[round(float(x), 9), round(float(y), 9)] for x, y in zip(lons, lats)]


def generate(site: str, public: Path):
    config = SITES[site]
    src = public / config["data"]
    manifest = json.loads((src / "manifest.json").read_text())
    discovery = json.loads((src / "discovery.json").read_text())
    assert discovery["status"] == "EXPLORATORY_PROCESSED_NOT_QA_CLEARED"
    assert len(manifest["frames"]) == 1 and len(discovery["selected"]) == 2
    frame = manifest["frames"][0]
    acquisitions = frame["acquisitions"]
    assert len(acquisitions) == 2 and not frame["mixedVersions"]
    dates = [a["date"][:10] for a in acquisitions]
    granules = [s["sceneName"] for s in discovery["selected"]]
    assert dates == [x["date"] for x in discovery["selected"]]
    assert all(a["productVersion"] == acquisitions[0]["productVersion"] for a in acquisitions)
    assert all(a["compositeReleaseId"] == acquisitions[0]["compositeReleaseId"] for a in acquisitions)

    evdir, rgdir, pvdir = (public / f"{site}-{suffix}" for suffix in ("evidence", "regions", "preview"))
    for directory in (evdir, rgdir, pvdir):
        directory.mkdir(parents=True, exist_ok=True)
    arrays, stats, hashes = {}, {}, {}
    ref_crs, ref_transform, ref_shape = None, None, None
    for pol in ("HH", "HV"):
        arrays[pol] = []
        for index, a in enumerate(acquisitions):
            tif = src / a["cog"][pol]
            img = src / a["overlays"][pol]
            values, crs, t = read_raster(tif)
            if ref_crs is None:
                ref_crs, ref_transform, ref_shape = crs, t, values.shape
            assert crs == ref_crs and t.almost_equals(ref_transform) and values.shape == ref_shape, "Misregistered source raster"
            arrays[pol].append(values)
            dst = pvdir / f"{dates[index].replace('-', '')}_{pol}.png"
            shutil.copyfile(img, dst)
            hashes[(pol, index)] = hashlib.sha256(dst.read_bytes()).hexdigest()
        difference = arrays[pol][1] - arrays[pol][0]
        native_delta, c, t = read_raster(src / next(x["cog"] for x in frame["changeLayers"] if x["type"] == "dbDiff" and x["pol"] == pol))
        common = np.isfinite(difference) & np.isfinite(native_delta)
        assert common.sum() > 1000
        assert np.max(np.abs(difference[common] - native_delta[common])) < 2e-4, "Difference does not match input COGs"
        diff_png = next(x["url"] for x in frame["changeLayers"] if x["type"] == "dbDiff" and x["pol"] == pol)
        shutil.copyfile(src / diff_png, rgdir / f"{pol}_difference_exploratory.png")
        lo, hi = RANGES[pol]
        bins = np.linspace(lo, hi, 49)
        first, counts1 = obs(arrays[pol][0], dates[0], granules[0], (lo, hi), bins)
        second, counts2 = obs(arrays[pol][1], dates[1], granules[1], (lo, hi), bins)
        assert counts1.sum() + first["outsideDisplayRange"] == first["count"]
        assert counts2.sum() + second["outsideDisplayRange"] == second["count"]
        hist = []
        for i in range(48):
            hist.append({"lowDb": float(bins[i]), "highDb": float(bins[i + 1]),
                         "firstCount": int(counts1[i]), "secondCount": int(counts2[i])})
        plt.figure(figsize=(8, 4.5))
        plt.plot(bins[:-1], counts1, label=dates[0], linewidth=1.5)
        plt.plot(bins[:-1], counts2, label=dates[1], linewidth=1.5)
        plt.xlabel(f"{pol} gamma0 backscatter (dB)")
        plt.ylabel("Reduced-grid pixels in fixed bins")
        plt.title(config["title"] + " — exploratory radar return")
        plt.legend()
        plt.tight_layout()
        plt.savefig(evdir / f"{pol}_histogram_comparison.png", dpi=140)
        plt.close()
        stats[pol] = {
            "observations": [first, second],
            "differenceOfRegionalMeansDb": round(second["meanDb"] - first["meanDb"], 6),
            "differenceOfRegionalMediansDb": round(second["medianDb"] - first["medianDb"], 6),
            "differenceInterpretation": "Difference of separate whole-scene summaries; not paired-pixel change",
            "histogramBinCountFieldByDate": {dates[0]: "firstCount", dates[1]: "secondCount"},
            "histogramBins": hist, "histogramImage": f"{pol}_histogram_comparison.png",
        }
    assert ref_crs is not None and ref_transform is not None and ref_shape is not None
    h, w = ref_shape
    valid = np.logical_and.reduce([np.isfinite(arrays[p][i]) for p in ("HH", "HV") for i in (0, 1)])
    diffs = {p: arrays[p][1] - arrays[p][0] for p in ("HH", "HV")}
    # Use non-overlapping, reproducible, 64×64 reduced-grid windows. Prefer
    # HH positive, HH negative and lower-magnitude differences in A/B/C.
    size = 64
    candidates = []
    for row in range(0, h - size + 1, 32):
        for col in range(0, w - size + 1, 32):
            mask = valid[row:row+size, col:col+size]
            if mask.sum() < int(size * size * 0.9):
                continue
            d = diffs["HH"][row:row+size, col:col+size][mask]
            candidates.append((float(np.median(d)), row, col))
    if not candidates:
        raise ValueError("No sufficiently valid candidate analysis regions")
    selected = []
    for order in (sorted(candidates, reverse=True), sorted(candidates),
                  sorted(candidates, key=lambda x: abs(x[0]))):
        choice = next((c for c in order if all(abs(c[1] - o[1]) >= size + 8 or abs(c[2] - o[2]) >= size + 8 for o in selected)), None)
        if choice is None:
            raise ValueError("Could not find three sufficiently separated candidate regions")
        selected.append(choice)

    region_items, features, annotations = [], [], []
    titles = ["Relatively increasing HH radar return", "Relatively decreasing HH radar return", "Lower-magnitude HH radar difference"]
    for idx, (_, row, col) in enumerate(selected):
        ident = "ABC"[idx]
        mask = valid[row:row+size, col:col+size]
        rp = {}
        for pol in ("HH", "HV"):
            a, b = (arrays[pol][i][row:row+size, col:col+size][mask] for i in (0, 1))
            d = b - a
            rp[pol] = {
                "beforeMedianDb": round(float(np.median(a)), 5),
                "afterMedianDb": round(float(np.median(b)), 5),
                "pairedDifference": {
                    "pixels": int(d.size),
                    "medianDifferenceDb": round(float(np.median(d)), 5),
                    "meanDifferenceDb": round(float(np.mean(d)), 5),
                    "p05DifferenceDb": round(float(np.percentile(d, 5)), 5),
                    "p95DifferenceDb": round(float(np.percentile(d, 95)), 5),
                },
            }
        method = "64×64 reduced-grid candidate window; reproducible exploratory HH median ranking; spatially separated, not a representative sample"
        item = {
            "id": ident, "title": titles[idx], "selectionMethod": method,
            "rowRange": [row, row+size], "columnRange": [col, col+size],
            "stats": rp, "scientificStatus": QA,
            "environmentalConclusion": None,
            "warning": "Backscatter change cannot independently establish erosion, flooding or vegetation damage",
        }
        region_items.append(item)
        features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates":
                          [corners(ref_transform, ref_shape, ref_crs, row, row+size, col, col+size)]},
                         "properties": item})
        annotations.append({"id": ident, "observation": f"Region {ident} selected by an exploratory difference ranking of valid reduced-grid radar pixels.",
                            "interpretation": "The radar intensity changed; the environmental cause is unverified."})

    gap = "Erosion and storm flooding" if site == "rodanthe" else "Inundation, river migration and vegetation change" if site == "amazon" else "Physical environmental change"
    evidence = {
        "schemaVersion": "everglades-compatible-1.0", "title": config["title"] + " NISAR backscatter evidence",
        "studyArea": config["region"], "provenance": "NASA NISAR Level-2 GCOV provisional via ASF DAAC, processed by TANGO",
        "measurement": "gamma0 backscatter dB derived from screened linear power; statistics describe reduced georeferenced COG pixels",
        "scientificClearance": CLEARANCE,
        "quality": {
            "identificationGroup": "UNVERIFIED; official NISAR product QA records have not been cleared for either acquisition",
            "frequencyAHHAndHVValidity": "PASS in processed inputs: two dates both contain finite HH/HV reduced-grid values",
            "gridAlignment": f"PASS for this derived ROI: common {ref_crs} transform and {w}×{h} analysis array",
            "radiometricArtifactsAndNoise": "UNVERIFIED; RFI, banding, calibration artifacts and noise-floor impacts require expert review",
        },
        "limitations": [
            "Exploratory comparison of actual NASA NISAR observations, not a validated environmental finding.",
            f"{gap} require independent satellite, field, and water-level evidence; backscatter change alone is insufficient.",
            "Whole-scene summary differences are not per-pixel differences. Region changes use paired valid reduced-grid pixels.",
            "Histograms and region candidate counts are computed from reduced analysis COGs, not every native HDF5 pixel.",
            "Candidate regions are selected for contrasting radar differences and are not a random or representative sample.",
            "Provisional NISAR product-level identification and radiometric QA have not been independently cleared.",
        ],
        "dates": dates, "polarizations": stats,
    }
    save(evdir / "evidence.json", evidence)
    dx, dy = ref_transform.a, ref_transform.e
    meta = {
        "schemaVersion": "sar-waltz-regions-1.0", "study": config["title"],
        "dates": dates, "sourceGranules": granules, "crs": str(ref_crs),
        "nativeShape": [h, w], "pixelSpacingMeters": [dx, dy],
        "firstPixelCenter": list(ref_transform * (0.5, 0.5)),
        "pairedHHAndHVPixels": int(valid.sum()),
        "differenceDefinition": "later gamma0 dB minus earlier gamma0 dB on paired valid reduced-grid pixels",
        "visualizationScale": {"limitsDb": [-6, 6]},
        "scientificStatus": QA, "regionCount": 3, "regions": region_items,
        "annotations": annotations,
    }
    save(rgdir / "regions.json", meta)
    save(rgdir / "regions.geojson", {"type": "FeatureCollection", "features": features})
    pr = {
        "schemaVersion": "preview-1.0",
        "provenance": "NASA NISAR GCOV via ASF DAAC, georeferenced overview",
        "sourceCollection": "NISAR L2 GCOV provisional",
        "bounds": frame["bounds"],
        "measurement": "gamma0 linear power converted to dB; georeferenced overview",
        "scientificClearance": CLEARANCE,
        "acquisitions": [
            {"date": dates[i], "conceptId": granules[i],
             "track": frame["track"], "frame": frame["frame"],
             "images": {
                 p: {"filename": f"{dates[i].replace('-', '')}_{p}.png",
                     "displayRangeDb": list(RANGES[p]),
                     "screenedPixels": int(np.isfinite(arrays[p][i]).sum()),
                     "sha256": hashes[(p, i)]}
                 for p in ("HH", "HV")
             }} for i in (0, 1)
        ],
    }
    save(pvdir / "preview-manifest.json", pr)
    print(f"{site}: {w}x{h} COG cells, {valid.sum()} paired, 3 selected regions, both polarizations; all evidence generated from real COGs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--public", type=Path, default=Path("frontend/public/data"))
    parser.add_argument("--site", choices=tuple(SITES), required=True)
    args = parser.parse_args()
    generate(args.site, args.public)
