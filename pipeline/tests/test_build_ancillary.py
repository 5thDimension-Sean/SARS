"""Synthetic rasters only; these values are test fixtures, never real land cover or population."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from pipeline.build_ancillary import AncillaryError, build_manifest, main, summarise_raster

BOUNDS = (-93.64, 42.00, -93.60, 42.04)


def make(path: Path, data: np.ndarray, nodata=0, crs="EPSG:4326") -> Path:
    h, w = data.shape
    with rasterio.open(path, "w", driver="GTiff", height=h, width=w, count=1, dtype=data.dtype, crs=crs,
                       transform=from_origin(-93.70, 42.10, 0.01 / 4, 0.01 / 4), nodata=nodata) as dst:
        dst.write(data, 1)
    return path


def spec(raster: str, **extra):
    layer = {"id": "t", "kind": "land_cover", "raster": raster, "title": "Test", "source": "Synthetic", "sourceUrl": "https://example.org/x",
             "year": 2021, "license": "test", "caveat": "fixture", **extra}
    return {"studyId": "iowa", "bounds": list(BOUNDS), "layers": [layer]}


def test_categorical_shares_sum_to_one_and_mask_nodata(tmp_path):
    data = np.full((40, 40), 10, dtype="uint8"); data[:, 32:] = 40; data[30:34, :] = 0  # footprint is rows/cols 24-40; 0 = nodata
    out = summarise_raster(make(tmp_path / "a.tif", data), BOUNDS, classes={"10": "Trees", "40": "Crops"}, nodata=0, unit=None)
    assert sum(c["fraction"] for c in out["classes"]) == pytest.approx(1)
    assert {c["label"] for c in out["classes"]} == {"Trees", "Crops"}
    assert 0 < out["validFraction"] < 1


def test_unknown_class_keeps_visible_label(tmp_path):
    out = summarise_raster(make(tmp_path / "a.tif", np.full((40, 40), 77, dtype="uint8")), BOUNDS, classes={}, nodata=0, unit=None)
    assert out["classes"][0]["label"] == "Class 77"


def test_continuous_total_ignores_nodata_and_needs_unit(tmp_path):
    data = np.full((40, 40), 2.0, dtype="float32"); data[30:34, :] = -9999
    r = make(tmp_path / "p.tif", data, nodata=-9999)
    out = summarise_raster(r, BOUNDS, classes=None, nodata=None, unit="people")
    assert out["total"]["unit"] == "people" and out["total"]["value"] > 0
    with pytest.raises(AncillaryError):
        summarise_raster(r, BOUNDS, classes=None, nodata=None, unit=None)


def test_raster_that_misses_footprint_or_all_nodata_is_refused(tmp_path):
    far = tmp_path / "far.tif"
    with rasterio.open(far, "w", driver="GTiff", height=8, width=8, count=1, dtype="uint8", crs="EPSG:4326", transform=from_origin(10, 10, .01, .01)) as d:
        d.write(np.ones((8, 8), dtype="uint8"), 1)
    with pytest.raises(AncillaryError):
        summarise_raster(far, BOUNDS, classes={}, nodata=0, unit=None)
    with pytest.raises(AncillaryError):
        summarise_raster(make(tmp_path / "z.tif", np.zeros((40, 40), dtype="uint8")), BOUNDS, classes={}, nodata=0, unit=None)


def test_missing_provenance_and_unsafe_url_are_refused(tmp_path):
    make(tmp_path / "a.tif", np.full((40, 40), 10, dtype="uint8"))
    s = spec("a.tif"); del s["layers"][0]["license"]
    with pytest.raises(AncillaryError):
        build_manifest(s, tmp_path)
    for bad in ("javascript:alert(1)", "http://example.org/x", "https://user:pw@example.org/x"):
        with pytest.raises(AncillaryError):
            build_manifest(spec("a.tif", sourceUrl=bad), tmp_path)


def test_cli_writes_manifest(tmp_path):
    make(tmp_path / "a.tif", np.full((40, 40), 10, dtype="uint8"))
    (tmp_path / "spec.json").write_text(json.dumps(spec("a.tif", classes={"10": "Trees"})))
    assert main([str(tmp_path / "spec.json"), "--out", str(tmp_path / "out")]) == 0
    m = json.loads((tmp_path / "out" / "ancillary.json").read_text())
    assert m["studyId"] == "iowa" and m["layers"][0]["classes"][0]["label"] == "Trees"
    assert main([str(tmp_path / "missing.json"), "--out", str(tmp_path / "o2")]) == 2
