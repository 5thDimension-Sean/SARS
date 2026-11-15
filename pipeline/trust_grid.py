"""Export paired dB-difference grids for the browser-side trust layer.

The trust layer (frontend/lib/trust-metrics.mts) must never recover numbers from
the clipped, 8-bit difference PNG. It reads these numerical grids instead.

Format, one file per polarization: little-endian int16, row-major, north-up
(row 0 is the northernmost row), value = round(difference_dB / 0.01), with
-32768 meaning "no valid paired observation". A small JSON sidecar records
shape, scale, nodata value, dates, source granules and the QA caveat so the
grid cannot be mistaken for a cleared product.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

NODATA = -32768
SCALE_DB = 0.01
SCHEMA = 'sar-waltz-difference-grid-1.0'
_LIMIT = 32767 * SCALE_DB  # largest representable magnitude, about 327 dB


def encode_difference(diff: np.ndarray) -> bytes:
    """Encode a 2-D float array of after-minus-before dB to little-endian int16.

    NaN or infinite entries become NODATA. A finite value that cannot be
    represented raises instead of being clipped, because silent clipping would
    manufacture a plausible-looking but false measurement.
    """
    arr = np.asarray(diff, dtype=np.float64)
    if arr.ndim != 2 or arr.size == 0:
        raise ValueError('Difference grid must be a non-empty 2-D array')
    finite = np.isfinite(arr)
    if np.any(np.abs(arr[finite]) > _LIMIT):
        raise ValueError('Difference exceeds the representable range; refusing to clip')
    out = np.full(arr.shape, NODATA, dtype='<i2')
    out[finite] = np.rint(arr[finite] / SCALE_DB).astype('<i2')
    return out.tobytes()


def decode_difference(data: bytes, shape: tuple[int, int]) -> np.ndarray:
    """Inverse of encode_difference; NODATA becomes NaN. Used by tests and QA."""
    raw = np.frombuffer(data, dtype='<i2')
    if raw.size != shape[0] * shape[1]:
        raise ValueError('Byte length does not match the declared shape')
    arr = raw.reshape(shape).astype(np.float64) * SCALE_DB
    arr[raw.reshape(shape) == NODATA] = np.nan
    return arr


def write_difference_grids(out_dir: Path, diffs: dict[str, np.ndarray], *, study: str,
                           dates: list[str], granules: list[str], crs: str,
                           pixel_spacing_m: list[float], first_pixel_center: list[float],
                           warning: str) -> Path:
    """Write {POL}_difference_grid.i16 for each polarization plus difference-grid.json."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    shapes = {tuple(np.asarray(d).shape) for d in diffs.values()}
    if len(shapes) != 1:
        raise ValueError('All polarizations must share one grid shape')
    (shape,) = shapes
    files = {}
    for pol, diff in sorted(diffs.items()):
        name = f'{pol}_difference_grid.i16'
        (out_dir / name).write_bytes(encode_difference(diff))
        files[pol] = name
    meta = {
        'schemaVersion': SCHEMA, 'study': study, 'dates': dates, 'sourceGranules': granules,
        'definition': 'after dB minus before dB; paired pixel difference of gamma0',
        'dtype': 'int16', 'byteOrder': 'little', 'scaleDb': SCALE_DB, 'nodata': NODATA,
        'shape': [int(shape[0]), int(shape[1])], 'rowOrder': 'north-up',
        'crs': crs, 'pixelSpacingMeters': pixel_spacing_m, 'firstPixelCenter': first_pixel_center,
        'files': files, 'scientificStatus': 'EXPLORATORY_NOT_CLEARED', 'warning': warning,
    }
    path = out_dir / 'difference-grid.json'
    path.write_text(json.dumps(meta, indent=2), encoding='utf-8')
    return path
