#!/usr/bin/env python3
"""Summarise locally downloaded ancillary rasters (land cover, vegetation, population) over a study footprint.

Offline step. It never touches the network and never reads radar pixels. You download the public dataset yourself
(ESA WorldCover, NLCD, WorldPop, GHSL...), describe it in a spec file, and this writes the validated
``ancillary.json`` that the website shows under "What surrounds the radar".

Spec file (JSON)::

    {"studyId": "iowa", "bounds": [-93.64, 42.00, -93.60, 42.04],
     "layers": [{"id": "worldcover", "kind": "land_cover", "raster": "ESA_WorldCover_N42W095.tif",
                 "title": "ESA WorldCover 10 m", "source": "ESA WorldCover 2021 v200",
                 "sourceUrl": "https://esa-worldcover.org/", "year": 2021, "version": "v200",
                 "license": "CC BY 4.0", "caveat": "Classified from optical and radar imagery; not a measurement of change.",
                 "nodata": 0, "classes": {"10": "Tree cover", "40": "Cropland"}}]}

``classes`` makes a layer categorical (share of valid pixels per class). Otherwise it is continuous and needs
``"unit"``; the footprint total is the sum of valid pixels, which is only meaningful for per-cell counts such as
WorldPop "people per pixel". Pixels are included when their centre falls inside the footprint.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import numpy as np
import rasterio
from rasterio.transform import rowcol
from rasterio.warp import transform_bounds

KINDS = ("population", "land_cover", "vegetation", "other")


class AncillaryError(ValueError):
    """An actionable input error."""


def _require_https(url: str) -> str:
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname or "." not in p.hostname or p.username or p.password:
        raise AncillaryError(f"sourceUrl must be a plain https link: {url!r}")
    return url


def summarise_raster(raster: Path, bounds: tuple[float, float, float, float], *, classes: dict[str, str] | None,
                     nodata: float | None, unit: str | None) -> dict[str, Any]:
    """Return {classes|total, validFraction, resolutionM} for pixels whose centres fall inside ``bounds`` (lon/lat)."""
    w, s, e, n = bounds
    if not (w < e and s < n and -180 <= w and e <= 180 and -90 <= s and n <= 90):
        raise AncillaryError(f"Invalid footprint bounds {bounds}")
    with rasterio.open(raster) as src:
        if src.crs is None:
            raise AncillaryError(f"{raster.name} has no CRS; refusing to guess its georeferencing")
        left, bottom, right, top = transform_bounds("EPSG:4326", src.crs, w, s, e, n, densify_pts=21)
        r0, c0 = rowcol(src.transform, left, top, op=math.floor)
        r1, c1 = rowcol(src.transform, right, bottom, op=math.ceil)
        r0, r1 = sorted((max(r0, 0), min(r1, src.height))); c0, c1 = sorted((max(c0, 0), min(c1, src.width)))
        if r1 <= r0 or c1 <= c0:
            raise AncillaryError(f"{raster.name} does not cover the study footprint")
        data = src.read(1, window=((r0, r1), (c0, c1)), masked=False).astype("float64")
        nd = src.nodata if nodata is None else nodata
        res = float(abs(src.transform.a)) if src.crs.is_projected else float(abs(src.transform.a)) * 111_320 * math.cos(math.radians((s + n) / 2))
    valid = np.isfinite(data)
    if nd is not None:
        valid &= data != nd
    if not valid.any():
        raise AncillaryError(f"{raster.name} has no valid pixels inside the footprint")
    out: dict[str, Any] = {"validFraction": float(valid.sum() / valid.size), "resolutionM": round(res, 1)}
    if classes is not None:
        values, counts = np.unique(data[valid], return_counts=True)
        total = counts.sum()
        shares: dict[str, float] = {}
        for v, c in zip(values, counts):
            label = classes.get(str(int(v)), f"Class {int(v)}")
            shares[label] = shares.get(label, 0.0) + float(c / total)
        out["classes"] = [{"label": k, "fraction": round(f, 6)} for k, f in sorted(shares.items(), key=lambda kv: -kv[1])]
    else:
        if not unit:
            raise AncillaryError("A continuous layer needs a 'unit'")
        if (data[valid] < 0).any():
            raise AncillaryError(f"{raster.name} has negative valid values; set 'nodata' so they are masked")
        out["total"] = {"value": float(data[valid].sum()), "unit": unit}
    return out


def build_manifest(spec: dict[str, Any], base: Path) -> dict[str, Any]:
    bounds = tuple(float(x) for x in spec["bounds"])
    if len(bounds) != 4:
        raise AncillaryError("bounds must be [west, south, east, north]")
    layers = []
    for l in spec.get("layers", []):
        if l.get("kind") not in KINDS:
            raise AncillaryError(f"Layer {l.get('id')!r}: kind must be one of {KINDS}")
        for k in ("id", "title", "source", "sourceUrl", "year", "license", "caveat", "raster"):
            if not l.get(k):
                raise AncillaryError(f"Layer {l.get('id')!r}: missing '{k}' (source, year, license and caveat are required)")
        summary = summarise_raster((base / l["raster"]).resolve(), bounds, classes=l.get("classes"), nodata=l.get("nodata"), unit=l.get("unit"))
        layers.append({"id": l["id"], "kind": l["kind"], "title": l["title"], "source": l["source"], "sourceUrl": _require_https(l["sourceUrl"]),
                       "year": int(l["year"]), "version": l.get("version"), "license": l["license"], "caveat": l["caveat"], **summary})
    if not layers:
        raise AncillaryError("The spec lists no layers")
    return {"studyId": spec["studyId"], "bounds": list(bounds), "layers": layers}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path, help="spec JSON (rasters are resolved relative to it)")
    ap.add_argument("--out", type=Path, required=True, help="output directory, e.g. frontend/public/data/iowa-ancillary")
    a = ap.parse_args(argv)
    try:
        spec = json.loads(a.spec.read_text())
        manifest = build_manifest(spec, a.spec.parent)
    except (AncillaryError, OSError, KeyError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "ancillary.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {a.out / 'ancillary.json'} ({len(manifest['layers'])} layers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
