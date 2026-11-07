"""Small synthetic products; these fixtures are never NASA observations."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

import h5py
import numpy as np
import pytest


GRID = "/science/LSAR/GCOV/grids/frequencyA"
IDENTIFICATION = "/science/LSAR/identification"


def write_gcov(
    path: Path,
    *,
    date: str = "2026-07-03T12:00:00Z",
    hh: np.ndarray | None = None,
    hv: np.ndarray | None = None,
    mask: np.ndarray | None = None,
    track: int = 30,
    frame: int = 19,
    orbit: int = 1200,
    pass_direction: str = "Ascending",
    product_version: str = "1.0.0",
    composite_release_id: str = "P05023",
    maturity: str | None = None,
    epsg: int = 32617,
    x_origin: float = 500000.0,
    y_origin: float = 2800000.0,
    spacing: float = 10.0,
) -> Path:
    """Write only the actual product fields needed by the pipeline contract."""
    path.parent.mkdir(parents=True, exist_ok=True)
    hh = np.full((8, 10), 0.1, dtype=np.float32) if hh is None else np.asarray(hh, dtype=np.float32)
    hv = hh * np.float32(0.1) if hv is None else np.asarray(hv, dtype=np.float32)
    mask = np.ones(hh.shape, dtype=np.uint8) if mask is None else np.asarray(mask, dtype=np.uint8)
    with h5py.File(path, "w") as h5:
        identification = h5.require_group(IDENTIFICATION)
        strings = {
            "zeroDopplerStartTime": date,
            "zeroDopplerEndTime": date,
            "orbitPassDirection": pass_direction,
            "productVersion": product_version,
            "productSpecificationVersion": "1.6.0",
            "compositeReleaseId": composite_release_id,
            "productType": "GCOV",
            "radarBand": "L",
            "missionId": "NISAR",
            "processingType": "Nominal",
            "granuleId": "SYNTHETIC_TEST_ONLY",
        }
        if maturity is not None:
            strings["dataMaturity"] = maturity
        for name, value in strings.items():
            identification.create_dataset(name, data=np.bytes_(value))
        for name, value in {
            "absoluteOrbitNumber": orbit,
            "trackNumber": track,
            "frameNumber": frame,
        }.items():
            identification.create_dataset(name, data=value)
        grid = h5.require_group(GRID)
        grid.create_dataset("projection", data=epsg)
        grid.create_dataset("xCoordinateSpacing", data=spacing)
        grid.create_dataset("yCoordinateSpacing", data=-spacing)
        x = grid.create_dataset("xCoordinates", data=x_origin + np.arange(hh.shape[1]) * spacing)
        y = grid.create_dataset("yCoordinates", data=y_origin - np.arange(hh.shape[0]) * spacing)
        for coordinate in (x, y):
            coordinate.attrs["pixel_coordinate_convention"] = np.bytes_("center")
            coordinate.attrs["units"] = np.bytes_("meters")
        grid.create_dataset("listOfPolarizations", data=np.array([b"HH", b"HV"], dtype="S2"))
        grid.create_dataset("listOfCovarianceTerms", data=np.array([b"HHHH", b"HVHV"], dtype="S4"))
        for name, values in (("HHHH", hh), ("HVHV", hv)):
            ds = grid.create_dataset(name, data=values, chunks=True)
            ds.attrs["_FillValue"] = np.float32(np.nan)
            ds.attrs["units"] = np.bytes_("1")
            ds.attrs["long_name"] = np.bytes_("radar backscatter gamma0")
        mask_ds = grid.create_dataset("mask", data=mask, chunks=True)
        mask_ds.attrs["_FillValue"] = np.uint8(255)
        mask_ds.attrs["description"] = np.bytes_(
            "Subswath number for fully focused samples; 0 invalid and 255 outside acquisition"
        )
    return path


@pytest.fixture
def gcov_factory(tmp_path: Path) -> Callable[..., Path]:
    sequence = 0

    def factory(filename: str | None = None, **kwargs: object) -> Path:
        nonlocal sequence
        sequence += 1
        return write_gcov(tmp_path / "input" / (filename or f"synthetic_{sequence}.h5"), **kwargs)

    return factory

