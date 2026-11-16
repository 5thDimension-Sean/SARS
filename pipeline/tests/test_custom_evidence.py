"""Native pipeline integration with clearly synthetic, offline HDF5 fixtures."""
import json

import numpy as np
import pytest
import rasterio
from affine import Affine

from pipeline.nisar_to_overlays import process_directory
from pipeline.generate_unified_evidence import generate


def prepared(gcov_factory, tmp_path):
    values = np.random.default_rng(42).uniform(0.02, 0.2, (256, 256)).astype("float32")
    first = gcov_factory("first-test-only.h5", hh=values, maturity="PROVISIONAL")
    gcov_factory("second-test-only.h5", date="2026-07-15T12:00:00Z", hh=values * 1.1, maturity="PROVISIONAL")
    manifest = process_directory(first.parent, tmp_path / "results", max_size=256)
    (tmp_path / "results" / "discovery.json").write_text(json.dumps({
        "status": "EXPLORATORY_PROCESSED_NOT_QA_CLEARED",
        "selected": [{"date": date, "sceneName": "SYNTHETIC_TEST_ONLY_" + date} for date in ("2026-07-03", "2026-07-15")],
    }))
    return manifest


def test_custom_hdf5_to_previews_histograms_and_regions(gcov_factory, tmp_path):
    prepared(gcov_factory, tmp_path)
    generate("custom", tmp_path)
    evidence = json.loads((tmp_path / "custom-evidence" / "evidence.json").read_text())
    regions = json.loads((tmp_path / "custom-regions" / "regions.json").read_text())
    assert regions["regionCount"] == 3
    assert regions["pairedHHAndHVPixels"] == 256 * 256
    for pol in ("HH", "HV"):
        p = evidence["polarizations"][pol]
        assert len(p["histogramBins"]) == 48
        for index, field in enumerate(("firstCount", "secondCount")):
            observation = p["observations"][index]
            assert sum(b[field] for b in p["histogramBins"]) + observation["outsideDisplayRange"] == observation["count"]
            assert observation["granuleId"].startswith("SYNTHETIC_TEST_ONLY_")
        assert (tmp_path / "custom-preview" / f"20260703_{pol}.png").is_file()
        for region in regions["regions"]:
            assert region["environmentalConclusion"] is None
            assert region["stats"][pol]["pairedDifference"]["medianDifferenceDb"] == pytest.approx(10 * np.log10(1.1), abs=1e-4)


def test_misregistered_difference_cannot_pass_by_matching_values(gcov_factory, tmp_path):
    manifest = prepared(gcov_factory, tmp_path)
    delta = next(x["cog"] for x in manifest["frames"][0]["changeLayers"] if x["pol"] == "HH" and x["type"] == "dbDiff")
    with rasterio.open(tmp_path / "results" / delta, "r+", IGNORE_COG_LAYOUT_BREAK="YES") as dataset:
        dataset.transform = dataset.transform @ Affine.translation(1, 0)
    with pytest.raises(ValueError, match="Misregistered difference raster"):
        generate("custom", tmp_path)
