"""Coordinate and catalog contract shared by the private worker's offline tests."""
from __future__ import annotations

import math
from datetime import date


def point_bbox(latitude: float, longitude: float) -> tuple[float, float, float, float]:
    if (isinstance(latitude, bool) or isinstance(longitude, bool)
            or not math.isfinite(latitude) or not math.isfinite(longitude)
            or not -85 <= latitude <= 85 or not -180 <= longitude <= 180):
        raise ValueError("Use latitude from -85 to 85 and longitude from -180 to 180")
    # Keep a roughly 4 km square even at high latitudes. No arbitrary cosine
    # floor, which used to produce regions narrower than the analysis windows.
    dx = 0.018 / math.cos(math.radians(latitude))
    if longitude - dx < -180 or longitude + dx > 180:
        raise ValueError("This comparison cannot cross the antimeridian; move the point inland")
    return longitude - dx, latitude - 0.018, longitude + dx, latitude + 0.018


def compatible_key(properties: dict, metadata: dict, filename: str) -> tuple:
    """Missing catalog fields must never compare equal as the string 'None'."""
    track, frame = properties.get("pathNumber"), properties.get("frameNumber")
    if isinstance(track, bool) or isinstance(frame, bool):
        raise ValueError("Invalid orbit/frame")
    track, frame = int(track), int(frame)
    if not 1 <= track <= 173 or not 1 <= frame <= 176:
        raise ValueError("Invalid orbit/frame")
    direction = str(properties.get("flightDirection", "")).upper()
    if direction not in ("ASCENDING", "DESCENDING"):
        raise ValueError("Missing orbit direction")
    release, maturity = metadata.get("compositeReleaseId"), metadata.get("dataMaturity")
    # ASF does not always expose productVersion. The revision suffix is still
    # required to agree; the HDF5 productVersion is checked again before reads.
    revision = filename.rsplit("_", 1)[-1].removesuffix(".h5")
    if not release or maturity != "PROVISIONAL" or not (len(revision) == 3 and revision.isdigit()):
        raise ValueError("Missing processing compatibility metadata")
    return track, frame, direction, release, maturity, metadata.get("productVersion"), revision


def catalog_date(value: str, start: date, end: date) -> date:
    result = date.fromisoformat(value[:10])
    if not start <= result <= end:
        raise ValueError("Acquisition outside the requested interval")
    return result
