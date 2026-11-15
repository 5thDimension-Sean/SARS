"""Offline fixtures only; none of these tests certify real NASA observations."""
from datetime import date
import math

import pytest

from pipeline.coordinate_contract import point_bbox, compatible_key, catalog_date


@pytest.mark.parametrize("lat,lon", [(0, 0), (25.5, -80.8), (-85, 0), (85, 0)])
def test_bbox_keeps_physical_width_at_high_latitudes(lat, lon):
    w, s, e, n = point_bbox(lat, lon)
    assert (w + e) / 2 == pytest.approx(lon)
    assert (s + n) / 2 == pytest.approx(lat)
    assert (e - w) * math.cos(math.radians(lat)) == pytest.approx(n - s)


@pytest.mark.parametrize("lat,lon", [(90, 0), (-86, 0), (0, 181), (0, 180), (0, -180), (float("nan"), 0), (0, float("inf")), (True, 0), (85, 179.9)])
def test_invalid_or_crossing_coordinates_fail_before_download(lat, lon):
    with pytest.raises(ValueError):
        point_bbox(lat, lon)


def test_missing_compatibility_metadata_never_pairs_as_none():
    props = {"pathNumber": 25, "frameNumber": 70, "flightDirection": "ASCENDING"}
    meta = {"compositeReleaseId": "P05023", "dataMaturity": "PROVISIONAL", "productVersion": None}
    key = compatible_key(props, meta, "NISAR_TEST_001.h5")
    assert key[-1] == "001"
    for name in props:
        with pytest.raises((ValueError, TypeError)):
            compatible_key({**props, name: None}, meta, "NISAR_TEST_001.h5")
    for name in ("compositeReleaseId", "dataMaturity"):
        with pytest.raises(ValueError):
            compatible_key(props, {**meta, name: None}, "NISAR_TEST_001.h5")
    assert key != compatible_key(props, meta, "NISAR_TEST_002.h5")


def test_dates_must_be_in_search_window():
    assert catalog_date("2026-07-03T12:00:00Z", date(2026, 7, 1), date(2026, 7, 31)) == date(2026, 7, 3)
    with pytest.raises(ValueError):
        catalog_date("2025-07-03", date(2026, 7, 1), date(2026, 7, 31))
