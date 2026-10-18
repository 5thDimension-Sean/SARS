"""Science, output, and safety checks against explicitly synthetic GCOV inputs."""

from __future__ import annotations

import json
from pathlib import Path

import h5py
import numpy as np
from PIL import Image
import pytest
import rasterio
from rasterio.warp import transform_bounds
from rasterio.transform import Affine, array_bounds

from pipeline.common import PipelineError, colorize, multilook_power, power_to_db
from pipeline.nisar_to_overlays import process_directory
from conftest import GRID, IDENTIFICATION


def process_fixture(path: Path, tmp_path: Path, **kwargs: object) -> tuple[dict, Path]:
    out = tmp_path / "output"
    return process_directory(path.parent, out, **kwargs), out


def acquisition(manifest: dict, index: int = 0) -> dict:
    return manifest["frames"][0]["acquisitions"][index]


def test_power_to_db_masks_nonpositive_and_nonfinite() -> None:
    result = power_to_db(np.array([1, 0.1, 0.01, 0, -1, np.nan, np.inf], dtype=np.float32))
    assert result.dtype == np.float32
    np.testing.assert_allclose(result[:3], [0, -10, -20], atol=1e-5)
    assert np.isnan(result[3:]).all()


def test_multilooking_averages_linear_power_before_log(gcov_factory) -> None:
    power = np.array([[1.0, 0.01], [1.0, 0.01]], dtype=np.float32)
    path = gcov_factory(hh=power)
    with h5py.File(path) as h5:
        reduced = multilook_power(h5[f"{GRID}/HHHH"], h5[f"{GRID}/mask"], (0, 2, 0, 2), 1)
    assert reduced.shape == (1, 1)
    assert reduced.dtype == np.float32
    assert reduced[0, 0] == pytest.approx(0.505)
    assert power_to_db(reduced)[0, 0] == pytest.approx(-2.9671, abs=1e-4)
    assert abs(float(power_to_db(reduced)[0, 0]) - (-10.0)) > 5


def test_multilooking_excludes_invalid_power_and_subswaths(gcov_factory) -> None:
    power = np.array([[0.1, 100.0, 1.0], [0, -2, np.nan]], dtype=np.float32)
    mask = np.array([[1, 0, 255], [1, 2, 1]], dtype=np.uint8)
    path = gcov_factory(hh=power, mask=mask)
    with h5py.File(path) as h5:
        reduced = multilook_power(h5[f"{GRID}/HHHH"], h5[f"{GRID}/mask"], (0, 2, 0, 3), 1)
    assert reduced[0, 0] == pytest.approx(0.1)


def test_all_invalid_multilook_returns_nodata(gcov_factory) -> None:
    path = gcov_factory(hh=np.zeros((4, 4), dtype=np.float32))
    with h5py.File(path) as h5:
        reduced = multilook_power(h5[f"{GRID}/HHHH"], h5[f"{GRID}/mask"], (0, 4, 0, 4), 2)
    assert np.isnan(reduced).all()


def test_multilooking_crops_first_and_preserves_partial_edge_weights(gcov_factory) -> None:
    power = np.arange(1, 31, dtype=np.float32).reshape(5, 6)
    path = gcov_factory(hh=power)
    with h5py.File(path) as h5:
        reduced = multilook_power(h5[f"{GRID}/HHHH"], h5[f"{GRID}/mask"], (1, 5, 1, 6), 3)
    # Balanced integer bins for five columns have widths1,2,2; no padding contributes.
    expected = np.array([[power[1:3, 1].mean(), power[1:3, 2:4].mean(), power[1:3, 4:6].mean()],
                         [power[3:5, 1].mean(), power[3:5, 2:4].mean(), power[3:5, 4:6].mean()]], dtype=np.float32)
    np.testing.assert_allclose(reduced, expected)


def test_large_multilook_reads_bounded_windows() -> None:
    class WindowedArray:
        shape = (1025, 1537)
        dtype = np.dtype("float32")
        chunks = (128, 128)

        def __init__(self, mask: bool = False) -> None:
            self.mask = mask
            self.reads = []

        def __getitem__(self, key):
            assert isinstance(key, tuple) and len(key) == 2
            rows, cols = key
            assert isinstance(rows, slice) and isinstance(cols, slice)
            r0, r1, _ = rows.indices(self.shape[0])
            c0, c1, _ = cols.indices(self.shape[1])
            self.reads.append((r1 - r0, c1 - c0))
            assert r1 - r0 <= 512 and c1 - c0 <= 512
            return np.full((r1 - r0, c1 - c0), 1 if self.mask else 0.1,
                           dtype=np.uint8 if self.mask else np.float32)

    dataset, mask = WindowedArray(), WindowedArray(mask=True)
    result = multilook_power(dataset, mask, (0, 1025, 0, 1537), 128)
    assert max(result.shape) <= 128
    assert len(dataset.reads) > 1 and len(mask.reads) == len(dataset.reads)
    np.testing.assert_allclose(result, 0.1, atol=1e-6)


def test_colorization_uses_fixed_range_and_transparent_nodata() -> None:
    first = colorize(np.array([[-25, -12.5, 0, np.nan]], dtype=np.float32), (-25, 0))
    second = colorize(np.array([[-12.5, -24]], dtype=np.float32), (-25, 0))
    assert first.dtype == np.uint8
    assert first.shape == (1, 4, 4)
    assert first[0, 3, 3] == 0
    assert first[0, 0, 3] == 255 and first[0, 2, 3] == 255
    np.testing.assert_array_equal(first[0, 1], second[0, 0])
    assert first[0, 0, 0] < first[0, 1, 0] < first[0, 2, 0]


def test_manifest_schema_histogram_and_georeferenced_cog(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    manifest, out = process_fixture(path, tmp_path)
    assert manifest["provenance"] == "derived"
    assert manifest["source"] == "NISAR GCOV via ASF DAAC"
    assert manifest["generated"].endswith("Z") or "+00:00" in manifest["generated"]
    assert manifest["dbRanges"] == {"HH": [-25.0, 0.0], "HV": [-30.0, -5.0]}
    frame = manifest["frames"][0]
    assert frame["track"] == 30 and frame["frame"] == 19
    assert frame["passDirection"] == "ASCENDING" and frame["crs"] == "EPSG:4326"
    assert len(frame["bounds"]) == 4
    item = acquisition(manifest)
    assert item["orbit"] == 1200 and item["productVersion"] == "1.0.0"
    assert item["compositeReleaseId"] == "P05023" and item["pols"] == ["HH", "HV"]
    histogram = item["histogramDb"]["HH"]
    assert len(histogram["binEdges"]) == 65 and len(histogram["counts"]) == 64
    assert sum(histogram["counts"]) == 80
    assert sum(histogram["normalized"]) == pytest.approx(1)
    assert histogram["binEdges"][0] == -25 and histogram["binEdges"][-1] == 0
    for url in (*item["overlays"].values(), *item["cog"].values()):
        assert not url.startswith(("/", "http")) and ".." not in Path(url).parts
        assert (out / url).is_file()
    with rasterio.open(out / item["cog"]["HH"]) as tif:
        assert tif.dtypes == ("float32",)
        assert tif.nodata == -9999
        assert tif.crs.to_epsg() == 32617
        assert tif.compression.name.upper() == "DEFLATE"
        assert tif.tags(ns="IMAGE_STRUCTURE").get("LAYOUT") == "COG"
        assert tif.transform.c == 499995 and tif.transform.f == 2800005
        np.testing.assert_allclose(tif.read(1), -10, atol=1e-4)
        assert item["nativeCrs"] == "EPSG:32617"
        np.testing.assert_allclose(item["analysisBounds"], tif.bounds, atol=1e-6)
        np.testing.assert_allclose(item["analysisTransform"], tuple(tif.transform)[:6], atol=1e-6)
    with Image.open(out / item["overlays"]["HH"]) as png:
        assert png.mode == "RGBA" and max(png.size) <= 2048
    disk = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    assert disk == manifest
    json.dumps(manifest, allow_nan=False)


def test_png_web_mercator_extent_matches_manifest_on_all_dates(gcov_factory, tmp_path) -> None:
    path = gcov_factory(x_origin=300000.0, hh=np.full((37, 59), 0.1, dtype=np.float32))
    gcov_factory(date="2026-07-15T12:00:00Z", x_origin=300000.0,
                 hh=np.full((37, 59), 0.2, dtype=np.float32))
    manifest, out = process_fixture(path, tmp_path, max_size=24)
    frame = manifest["frames"][0]
    assert frame["overlayCrs"] == "EPSG:3857"
    width, height = frame["overlaySize"]
    projected_bounds = array_bounds(height, width, Affine(*frame["overlayTransform"]))
    expected = transform_bounds("EPSG:3857", "EPSG:4326", *projected_bounds, densify_pts=21)
    np.testing.assert_allclose(frame["bounds"], expected, atol=1e-10)
    urls = [url for item in frame["acquisitions"] for url in item["overlays"].values()]
    urls += [item["url"] for item in frame["changeLayers"]]
    for url in urls:
        with Image.open(out / url) as png:
            assert png.size == (width, height)


def test_nodata_alpha_and_histograms_do_not_count_invalid_pixels(gcov_factory, tmp_path) -> None:
    hh = np.full((8, 10), 0.1, dtype=np.float32)
    hh[:2, :2] = 0
    hh[2, 2] = np.nan
    mask = np.ones(hh.shape, dtype=np.uint8)
    mask[-2:, -2:] = 255
    mask[3, 3] = 0
    path = gcov_factory(hh=hh, mask=mask)
    manifest, out = process_fixture(path, tmp_path)
    assert sum(acquisition(manifest)["histogramDb"]["HH"]["counts"]) == 70
    with rasterio.open(out / acquisition(manifest)["cog"]["HH"]) as tif:
        assert np.count_nonzero(tif.read(1) == tif.nodata) == 10
    with Image.open(out / acquisition(manifest)["overlays"]["HH"]) as png:
        alpha = np.asarray(png.convert("RGBA"))[..., 3]
        assert np.any(alpha == 0) and np.any(alpha == 255)


def test_histograms_preserve_out_of_display_range_population(gcov_factory, tmp_path) -> None:
    hh = np.array([[1e-4, 1e-2, 1, 10]], dtype=np.float32)
    path = gcov_factory(hh=hh)
    manifest, _ = process_fixture(path, tmp_path)
    histogram = acquisition(manifest)["histogramDb"]["HH"]
    assert sum(histogram["counts"]) == 2
    assert sum(histogram["normalized"]) == pytest.approx(0.5)
    assert histogram["underflow"] == 1 and histogram["overflow"] == 1


def test_all_nodata_manifest_is_json_safe_and_images_transparent(gcov_factory, tmp_path) -> None:
    path = gcov_factory(hh=np.zeros((8, 10), dtype=np.float32))
    manifest, out = process_fixture(path, tmp_path)
    item = acquisition(manifest)
    assert sum(item["histogramDb"]["HH"]["counts"]) == 0
    assert sum(item["histogramDb"]["HH"]["normalized"]) == 0
    assert item["statisticsDb"]["HH"]["mean"] is None
    json.dumps(manifest, allow_nan=False)
    with Image.open(out / item["overlays"]["HH"]) as png:
        assert not np.any(np.asarray(png.convert("RGBA"))[..., 3])


def test_configurable_ranges_are_recorded_and_used_for_histograms(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    ranges = {"HH": (-40, 5), "HV": (-35, -10)}
    manifest, _ = process_fixture(path, tmp_path, db_ranges=ranges)
    assert manifest["dbRanges"] == {"HH": [-40, 5], "HV": [-35, -10]}
    for pol, limits in ranges.items():
        histogram = acquisition(manifest)["histogramDb"][pol]
        assert histogram["binEdges"][0] == limits[0]
        assert histogram["binEdges"][-1] == limits[1]


def test_dates_sorted_gaps_and_temporal_difference_sign(gcov_factory, tmp_path) -> None:
    last = gcov_factory("first_filename.h5", date="2026-08-08T12:00:00Z", hh=np.full((8, 10), 0.2))
    gcov_factory("last_filename.h5", date="2026-07-03T12:00:00Z")
    gcov_factory("middle.h5", date="2026-07-15T12:00:00Z", hh=np.full((8, 10), 0.1))
    manifest, out = process_fixture(last, tmp_path)
    frame = manifest["frames"][0]
    assert [a["date"][:10] for a in frame["acquisitions"]] == ["2026-07-03", "2026-07-15", "2026-08-08"]
    assert len(frame["gaps"]) == 1 and frame["gaps"][0]["days"] == 24
    temporal = [layer for layer in frame["changeLayers"] if layer["type"] == "dbDiff" and layer.get("pol", "HV") == "HV"]
    assert len(temporal) == 2
    newest = temporal[-1]
    assert newest["from"][:10] == "2026-07-15" and newest["to"][:10] == "2026-08-08"
    with rasterio.open(out / newest["cog"]) as tif:
        np.testing.assert_allclose(tif.read(1), 10 * np.log10(2), atol=1e-4)


def test_hv_minus_hh_is_db_ratio_not_linear_subtraction(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    gcov_factory(date="2026-07-15T12:00:00Z")
    manifest, out = process_fixture(path, tmp_path)
    ratio = [layer for layer in manifest["frames"][0]["changeLayers"] if layer["type"] == "hvhhDiff"]
    assert ratio
    with rasterio.open(out / ratio[0]["cog"]) as tif:
        np.testing.assert_allclose(tif.read(1), -10, atol=1e-4)


def test_temporal_difference_requires_valid_pixels_on_both_dates(gcov_factory, tmp_path) -> None:
    before = np.full((8, 10), 0.1, dtype=np.float32)
    after = np.full((8, 10), 0.2, dtype=np.float32)
    before[1, 1] = 0
    after[2, 2] = 0
    path = gcov_factory(hh=before)
    gcov_factory(date="2026-07-15T12:00:00Z", hh=after)
    manifest, out = process_fixture(path, tmp_path)
    temporal = next(layer for layer in manifest["frames"][0]["changeLayers"]
                    if layer["type"] == "dbDiff" and layer["pol"] == "HH")
    with rasterio.open(out / temporal["cog"]) as tif:
        values = tif.read(1)
        assert np.count_nonzero(values == tif.nodata) == 2
        np.testing.assert_allclose(values[values != tif.nodata], 10 * np.log10(2), atol=1e-4)


@pytest.mark.parametrize("field,new_value", [("productVersion", "2.0.0"), ("compositeReleaseId", "P05024"), ("dataMaturity", "BETA")])
def test_mixed_processing_versions_refused_and_opt_in_flagged(gcov_factory, tmp_path, field, new_value) -> None:
    path = gcov_factory(maturity="PROVISIONAL")
    other = gcov_factory(date="2026-07-15T12:00:00Z", maturity="PROVISIONAL")
    with h5py.File(other, "r+") as h5:
        del h5[f"{IDENTIFICATION}/{field}"]
        h5.create_dataset(f"{IDENTIFICATION}/{field}", data=np.bytes_(new_value))
    out = tmp_path / "output"
    with pytest.raises(PipelineError, match="(?i)(version|maturity|release)"):
        process_directory(path.parent, out)
    assert not out.exists()
    manifest = process_directory(path.parent, out, allow_mixed_versions=True)
    assert manifest.get("mixedVersions") is True or manifest["frames"][0].get("mixedVersions") is True
    assert any("mixed" in note.lower() for note in manifest["processingNotes"])
    assert all(layer.get("mixedVersions") is True for layer in manifest["frames"][0]["changeLayers"] if layer["type"] == "dbDiff")


def test_same_day_duplicates_rejected(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    gcov_factory(date="2026-07-03T13:00:00Z")
    with pytest.raises(PipelineError, match="(?i)(duplicate|same.*date|same.*day)"):
        process_directory(path.parent, tmp_path / "output")


@pytest.mark.parametrize("field", ["HVHV", "mask", "projection", "xCoordinates"])
def test_missing_grid_fields_fail_with_inspection_context(gcov_factory, tmp_path, field) -> None:
    path = gcov_factory()
    with h5py.File(path, "r+") as h5:
        del h5[f"{GRID}/{field}"]
    with pytest.raises(PipelineError) as error:
        process_directory(path.parent, tmp_path / "output")
    message = str(error.value)
    assert field.lower() in message.lower()
    assert "found" in message.lower() or "inspect" in message.lower()


@pytest.mark.parametrize("path_name", [GRID, IDENTIFICATION, f"{GRID}/HHHH", f"{GRID}/projection"])
def test_malformed_group_dataset_types_fail_clearly(gcov_factory, tmp_path, path_name) -> None:
    path = gcov_factory()
    with h5py.File(path, "r+") as h5:
        was_group = isinstance(h5[path_name], h5py.Group)
        del h5[path_name]
        if was_group:
            h5.create_dataset(path_name, data=1)
        else:
            h5.create_group(path_name)
    with pytest.raises(PipelineError) as error:
        process_directory(path.parent, tmp_path / "output")
    assert "found" in str(error.value).lower() or "expected" in str(error.value).lower()


@pytest.mark.parametrize("field,value", [("trackNumber", "not-a-number"),
                                         ("trackNumber", 30.5), ("trackNumber", 0),
                                         ("frameNumber", 177), ("absoluteOrbitNumber", -1)])
def test_invalid_integer_identification_fails_clearly(gcov_factory, tmp_path, field, value) -> None:
    path = gcov_factory()
    with h5py.File(path, "r+") as h5:
        del h5[f"{IDENTIFICATION}/{field}"]
        h5.create_dataset(f"{IDENTIFICATION}/{field}", data=np.bytes_(value) if isinstance(value, str) else value)
    with pytest.raises(PipelineError) as error:
        process_directory(path.parent, tmp_path / "output")
    assert field in str(error.value)


def test_missing_version_is_not_silently_compatible(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    with h5py.File(path, "r+") as h5:
        del h5[f"{IDENTIFICATION}/compositeReleaseId"]
    with pytest.raises(PipelineError, match="compositeReleaseId"):
        process_directory(path.parent, tmp_path / "output")


def test_asf_sidecar_maturity_is_preserved_and_compared(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    other = gcov_factory(date="2026-07-15T12:00:00Z")
    for product, maturity in ((path, "BETA"), (other, "PROVISIONAL")):
        product.with_name(product.name + ".asf.json").write_text(
            json.dumps({"source": "ASF DAAC", "dataMaturity": maturity}), encoding="utf-8"
        )
    with pytest.raises(PipelineError, match="(?i)(maturity|version)"):
        process_directory(path.parent, tmp_path / "output")
    manifest, _ = process_fixture(path, tmp_path, allow_mixed_versions=True)
    assert [item["dataMaturity"] for item in manifest["frames"][0]["acquisitions"]] == ["BETA", "PROVISIONAL"]


def test_missing_maturity_is_explicitly_unknown(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    manifest, _ = process_fixture(path, tmp_path)
    assert acquisition(manifest)["dataMaturity"] == "UNKNOWN"


@pytest.mark.parametrize("kwargs", [{"x_origin": 500010.0}, {"epsg": 32618}, {"hh": np.ones((9, 10), dtype=np.float32)}])
def test_mismatched_same_frame_grid_refused(gcov_factory, tmp_path, kwargs) -> None:
    path = gcov_factory()
    gcov_factory(date="2026-07-15T12:00:00Z", **kwargs)
    with pytest.raises(PipelineError, match="(?i)(grid|alignment|shape|CRS)"):
        process_directory(path.parent, tmp_path / "output")
    assert not (tmp_path / "output").exists()


def test_multiple_frames_never_form_cross_frame_changes(gcov_factory, tmp_path) -> None:
    path = gcov_factory(frame=19)
    gcov_factory(date="2026-07-15T12:00:00Z", frame=20)
    gcov_factory(date="2026-07-27T12:00:00Z", frame=19)
    manifest, _ = process_fixture(path, tmp_path)
    assert len(manifest["frames"]) == 2
    first, second = sorted(manifest["frames"], key=lambda f: f["frame"])
    assert first["id"] != second["id"]
    assert len(first["acquisitions"]) == 2 and len(second["acquisitions"]) == 1
    assert len([l for l in first["changeLayers"] if l["type"] == "dbDiff"]) in (1, 2)
    assert not any(l["type"] == "dbDiff" for l in second["changeLayers"])


def test_dry_run_reads_metadata_without_writing_outputs(gcov_factory, tmp_path, monkeypatch) -> None:
    path = gcov_factory()
    out = tmp_path / "output"
    import pipeline.nisar_to_overlays as processor

    def no_power_reads(*args, **kwargs):
        raise AssertionError("Dry-run must not read image power arrays")

    monkeypatch.setattr(processor, "multilook_power", no_power_reads)
    manifest = process_directory(path.parent, out, dry_run=True)
    assert manifest["frames"] and not out.exists()


def test_aoi_crop_limits_georeferenced_extent(gcov_factory, tmp_path) -> None:
    path = gcov_factory(hh=np.full((100, 100), 0.1, dtype=np.float32))
    full_manifest, out = process_fixture(path, tmp_path)
    west, south, east, north = full_manifest["frames"][0]["bounds"]
    bbox = (west + (east - west) * 0.25, south + (north - south) * 0.25,
            west + (east - west) * 0.75, south + (north - south) * 0.75)
    cropped_out = tmp_path / "crop"
    cropped = process_directory(path.parent, cropped_out, aoi=bbox)
    with rasterio.open(cropped_out / acquisition(cropped)["cog"]["HH"]) as tif:
        assert 45 <= tif.width <= 55 and 45 <= tif.height <= 55
        assert tif.bounds.left > 499995 and tif.bounds.right < 500995
    assert cropped["frames"][0]["bounds"][0] > west
    assert cropped["frames"][0]["bounds"][2] < east


def test_aoi_outside_product_fails_clearly(gcov_factory, tmp_path) -> None:
    path = gcov_factory()
    with pytest.raises(PipelineError, match="(?i)(AOI|overlap|intersect)"):
        process_directory(path.parent, tmp_path / "output", aoi=(0, 0, 1, 1))


def test_quantization_preserves_alpha_and_max_size(gcov_factory, tmp_path) -> None:
    mask = np.ones((41, 57), dtype=np.uint8)
    mask[:10, :10] = 255
    path = gcov_factory(hh=np.full(mask.shape, 0.1), mask=mask)
    manifest, out = process_fixture(path, tmp_path, max_size=16, png_quantize=True)
    with rasterio.open(out / acquisition(manifest)["cog"]["HH"]) as tif:
        assert max(tif.shape) <= 16
    with Image.open(out / acquisition(manifest)["overlays"]["HH"]) as png:
        assert max(png.size) <= 16
        alpha = np.asarray(png.convert("RGBA"))[..., 3]
        assert np.any(alpha == 0) and np.any(alpha == 255)


@pytest.mark.parametrize("max_size", [0, -1, 8193])
def test_invalid_size_rejected_before_processing(gcov_factory, tmp_path, max_size) -> None:
    path = gcov_factory()
    with pytest.raises(PipelineError, match="(?i)(size|8192)"):
        process_directory(path.parent, tmp_path / "output", max_size=max_size)



def test_discovery_roi_grid_exports_numeric_values_and_transparent_nodata(gcov_factory, tmp_path) -> None:
    """Discovery Lab must ingest actual average dB values, never RGB pixel colors."""
    mask = np.ones((66, 66), dtype=np.uint8)
    mask[:18, :18] = 255
    path = gcov_factory(hh=np.full(mask.shape, 0.1, dtype=np.float32), mask=mask)
    manifest, output = process_fixture(path, tmp_path)
    a = acquisition(manifest)
    assert set(a["roiGrid"]) >= {"HH", "HV"}
    grid = json.loads((output / a["roiGrid"]["HH"]).read_text(encoding="utf-8"))
    assert grid["schemaVersion"] == "1.0"
    assert grid["type"] == "gamma0-db"
    assert grid["date"] == a["date"]
    assert grid["pol"] == "HH"
    assert grid["width"] == 96 and grid["height"] == 96
    assert len(grid["values"]) == 96 * 96
    finite = [v for v in grid["values"] if v is not None]
    assert finite and all(abs(v - (-10.0)) < 0.15 for v in finite)
    assert any(v is None for v in grid["values"]), "Masked pixels must remain transparent."
