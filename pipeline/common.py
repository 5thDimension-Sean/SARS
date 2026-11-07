"""Shared, bounded-memory GCOV helpers. No network or runtime web service."""
from __future__ import annotations

from datetime import datetime, timezone
import math
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np
from numpy.typing import NDArray
from PIL import Image
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine, array_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling, transform_bounds

NODATA = -9999.0
DEFAULT_DB_RANGES = {"HH": (-25.0, 0.0), "HV": (-30.0, -5.0)}
CHANGE_RANGE = (-6.0, 6.0)
POL_NAMES = {"HHHH": "HH", "HVHV": "HV"}
READ_BLOCK = 512


class PipelineError(ValueError):
    """An actionable input/layout/processing error."""


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        values = tuple(float(v.strip()) for v in value.split(","))
    except ValueError as exc:
        raise PipelineError("BBox must be west,south,east,north in degrees.") from exc
    if (len(values) != 4 or not all(math.isfinite(v) for v in values)
            or not -180 <= values[0] < values[2] <= 180
            or not -85.05112878 <= values[1] < values[3] <= 85.05112878):
        raise PipelineError("BBox requires west < east and south < north; longitude ±180, Web Mercator latitude ±85.05112878. Split antimeridian areas.")
    return values  # type: ignore[return-value]


def iso_time(value: Any) -> str:
    """Normalize UTC timestamps, including NISAR nanosecond fractional strings."""
    if isinstance(value, bytes):
        value = value.decode("utf-8")
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise PipelineError(f"Invalid acquisition timestamp: {value!r}") from exc
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def detect_gaps(dates: list[str], nominal_days: float = 12) -> list[dict[str, Any]]:
    gaps = []
    for earlier, later in zip(dates, dates[1:]):
        days = (datetime.fromisoformat(later.replace("Z", "+00:00"))
                - datetime.fromisoformat(earlier.replace("Z", "+00:00"))).total_seconds() / 86400
        if days > nominal_days:
            gaps.append({"from": earlier, "to": later, "days": round(days, 6)})
    return gaps


def power_to_db(power: Any) -> NDArray[np.float32]:
    values = np.asarray(power)
    valid = np.isfinite(values) & (values > 0)
    result = np.full(values.shape, np.nan, dtype=np.float32)
    np.log10(values, out=result, where=valid)
    result *= 10
    return result


def multilook_power(dataset: Any, mask: Any,
                    window: tuple[int, int, int, int], max_size: int) -> NDArray[np.float32]:
    """Average valid linear power in spatial bins using ≤512×512 HDF5 reads.

    Balanced integer bins cover the entire crop, including non-divisible edges.
    The output transform preserves the crop's exact extent. Each source pixel
    contributes once; an output cell with no valid contributions remains NaN.
    """
    r0, r1, c0, c1 = window
    height, width = r1-r0, c1-c0
    if height <= 0 or width <= 0 or max_size < 1:
        raise PipelineError("Empty crop or invalid max-size.")
    factor = max(1, math.ceil(max(height, width) / max_size))
    oh, ow = math.ceil(height/factor), math.ceil(width/factor)
    sums = np.zeros(oh*ow, dtype=np.float64)
    counts = np.zeros(oh*ow, dtype=np.uint64)
    row_edges = np.linspace(0, height, oh+1, dtype=np.int64)
    col_edges = np.linspace(0, width, ow+1, dtype=np.int64)
    for row in range(r0, r1, READ_BLOCK):
        stop_row = min(row+READ_BLOCK, r1)
        row_bins = np.searchsorted(row_edges[1:], np.arange(row-r0, stop_row-r0), side="right")
        for col in range(c0, c1, READ_BLOCK):
            stop_col = min(col+READ_BLOCK, c1)
            # Explicit windows only; never dataset[()] or [:] for a science raster.
            power = np.asarray(dataset[row:stop_row, col:stop_col])
            product_mask = np.asarray(mask[row:stop_row, col:stop_col])
            valid = np.isfinite(power) & (power > 0) & (product_mask > 0) & (product_mask < 255)
            col_bins = np.searchsorted(col_edges[1:], np.arange(col-c0, stop_col-c0), side="right")
            indices = row_bins[:, None]*ow + col_bins[None, :]
            np.add.at(sums, indices[valid], power[valid])
            np.add.at(counts, indices[valid], 1)
    result = np.full(oh*ow, np.nan, dtype=np.float32)
    np.divide(sums, counts, out=result, where=counts > 0)
    return result.reshape(oh, ow)


def histogram_db(values: NDArray[np.float32], db_range: tuple[float, float]) -> dict[str, Any]:
    valid = values[np.isfinite(values)]
    counts, edges = np.histogram(valid, bins=64, range=db_range)
    total = int(valid.size)
    return {"binEdges": edges.tolist(), "counts": counts.tolist(),
            "normalized": (counts / total if total else np.zeros(64)).tolist(),
            "validPixels": total, "underflow": int(np.count_nonzero(valid < db_range[0])),
            "overflow": int(np.count_nonzero(valid > db_range[1]))}


def statistics_db(values: NDArray[np.float32]) -> dict[str, Any]:
    valid = values[np.isfinite(values)]
    return {"mean": float(np.mean(valid, dtype=np.float64)) if valid.size else None,
            "min": float(np.min(valid)) if valid.size else None,
            "max": float(np.max(valid)) if valid.size else None,
            "validPixels": int(valid.size)}


def colorize(values: NDArray[np.float32], db_range: tuple[float, float],
             cmap: str = "gray") -> NDArray[np.uint8]:
    """A fixed display scale; transparent nodata. No image-specific stretching."""
    low, high = db_range
    if not math.isfinite(low+high) or low >= high:
        raise PipelineError("Display range must contain two finite increasing values.")
    valid = np.isfinite(values)
    scaled = np.clip((np.where(valid, values, low)-low)/(high-low), 0, 1)
    rgba = matplotlib.colormaps[cmap](scaled, bytes=True)
    rgba[~valid] = 0
    return rgba


def geographic_bounds(crs: CRS, transform: Affine, shape: tuple[int, int]) -> list[float]:
    bounds = transform_bounds(crs, "EPSG:4326", *array_bounds(*shape, transform), densify_pts=21)
    if not all(math.isfinite(v) for v in bounds) or bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
        raise PipelineError("Invalid geographic bounds; split antimeridian frames.")
    if bounds[1] < -85.05112878 or bounds[3] > 85.05112878:
        raise PipelineError("Frame exceeds Web Mercator latitude limits; use --aoi to crop.")
    return list(bounds)


def mercator_grid(crs: CRS, transform: Affine, shape: tuple[int, int], max_size: int) -> tuple[Affine, int, int]:
    target, width, height = calculate_default_transform(crs, "EPSG:3857", shape[1], shape[0],
                                                       *array_bounds(*shape, transform))
    scale = max(1.0, max(width, height)/max_size)
    new_width, new_height = max(1, math.ceil(width/scale)), max(1, math.ceil(height/scale))
    target = target @ Affine.scale(width/new_width, height/new_height)
    return target, new_width, new_height


def write_cog(path: Path, values: NDArray[np.float32], crs: CRS, transform: Affine) -> None:
    with rasterio.Env(GDAL_NUM_THREADS="1"):
        with rasterio.open(path, "w", driver="COG", height=values.shape[0], width=values.shape[1],
                           count=1, dtype="float32", crs=crs, transform=transform, nodata=NODATA,
                           compress="DEFLATE", blocksize=256, overview_resampling="nearest",
                           predictor="FLOATING_POINT") as dst:
            dst.write(np.where(np.isfinite(values), values, NODATA).astype(np.float32), 1)
            dst.update_tags(AREA_OR_POINT="Area", units="dB", provenance="derived",
                            processing="valid linear-power multilook before 10*log10; reduced analysis raster")


def write_png(path: Path, values: NDArray[np.float32], crs: CRS, transform: Affine,
              target: tuple[Affine, int, int], db_range: tuple[float, float],
              *, cmap: str = "gray", quantize: bool = False) -> None:
    target_transform, width, height = target
    projected = np.full((height, width), NODATA, dtype=np.float32)
    reproject(source=np.where(np.isfinite(values), values, NODATA).astype(np.float32),
              destination=projected, src_transform=transform, src_crs=crs, src_nodata=NODATA,
              dst_transform=target_transform, dst_crs="EPSG:3857", dst_nodata=NODATA,
              resampling=Resampling.nearest, num_threads=1)
    projected[projected == NODATA] = np.nan
    image = Image.fromarray(colorize(projected, db_range, cmap))
    if quantize:
        # FASTOCTREE supports RGBA and retains a transparent palette entry.
        image = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    image.save(path, optimize=True)
