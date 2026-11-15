"""Precompute web PNGs, reduced float32 COGs, and a static GCOV manifest."""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
import tempfile
from typing import Any

import h5py
import numpy as np
from rasterio.crs import CRS
from rasterio.transform import Affine, array_bounds
from rasterio.warp import transform_bounds, reproject, Resampling
from rasterio.windows import from_bounds

try:
    from .common import (CHANGE_RANGE, DEFAULT_DB_RANGES, POL_NAMES, PipelineError,
                         detect_gaps, geographic_bounds, histogram_db, iso_time,
                         mercator_grid, multilook_power, parse_bbox, power_to_db,
                         statistics_db, write_cog, write_png)
except ImportError:
    from common import (CHANGE_RANGE, DEFAULT_DB_RANGES, POL_NAMES, PipelineError,
                        detect_gaps, geographic_bounds, histogram_db, iso_time,
                        mercator_grid, multilook_power, parse_bbox, power_to_db,
                        statistics_db, write_cog, write_png)

LOG = logging.getLogger("sar_waltz")
GRID = "/science/LSAR/GCOV/grids/frequencyA"
IDENT = "/science/LSAR/identification"


@dataclass(frozen=True)
class Product:
    path: Path
    date: str
    end: str
    orbit: int
    track: int
    frame: int
    direction: str
    version: str
    release: str
    maturity: str
    specification: str
    crs: CRS
    transform: Affine
    shape: tuple[int, int]
    window: tuple[int, int, int, int]

    @property
    def frame_id(self) -> str:
        return f"T{self.track:03d}_F{self.frame:03d}_{self.direction[0]}"

    @property
    def version_key(self) -> tuple[str, str, str]:
        return self.version, self.release, self.maturity


def scalar(group: h5py.Group, key: str, *, required: bool = True) -> Any:
    if key not in group:
        if not required:
            return None
        raise PipelineError(f"Missing {group.name}/{key}; found: {', '.join(group.keys())}. Run inspect_h5.py.")
    dataset = group[key]
    if not isinstance(dataset, h5py.Dataset) or dataset.shape not in [(), (1,)]:
        raise PipelineError(f"Expected scalar metadata at {group.name}/{key}, found shape {getattr(dataset, 'shape', None)}.")
    value = dataset[()] if dataset.shape == () else dataset[0]
    if isinstance(value, bytes):
        return value.decode("utf-8").strip()
    return value.item() if isinstance(value, np.generic) else value


def integer_metadata(group: h5py.Group, key: str, low: int, high: int | None = None) -> int:
    value = scalar(group, key)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value != int(value):
        raise PipelineError(f"Invalid integer metadata {group.name}/{key}: {value!r}.")
    result = int(value)
    if result < low or (high is not None and result > high):
        raise PipelineError(f"Metadata {group.name}/{key} outside allowed range {low}..{high or 'unbounded'}: {result}.")
    return result


def check_coordinates(dataset: h5py.Dataset, spacing: float, size: int) -> float:
    if dataset.shape != (size,) or not math.isfinite(spacing) or spacing == 0:
        raise PipelineError(f"Invalid grid coordinate shape or spacing at {dataset.name}: {dataset.shape}, {spacing}.")
    first = float(dataset[0])
    for offset in range(0, size, 512):
        actual = dataset[offset:min(offset+512, size)]
        expected = first + np.arange(offset, offset+len(actual))*spacing
        if not np.allclose(actual, expected, rtol=0, atol=max(abs(spacing)*1e-5, 1e-6)):
            raise PipelineError(f"Nonuniform grid coordinates at {dataset.name}; cannot georeference safely.")
    return first


def inspect_product(path: Path, pols: tuple[str, ...], aoi: tuple[float, float, float, float] | None,
                    *, open_source=None) -> Product:
    """Validate the discovered hierarchy before any power raster is read."""
    with (open_source or h5py.File)(path, "r") as h5:
        if GRID not in h5 or IDENT not in h5:
            discovered: list[str] = []
            h5.visit(discovered.append)
            raise PipelineError(f"{path.name}: expected L-band GCOV {GRID} and {IDENT}. Found layout:\n"
                                + "\n".join(discovered) + "\nRun inspect_h5.py on this product.")
        grid, ident = h5[GRID], h5[IDENT]
        if not isinstance(grid, h5py.Group) or not isinstance(ident, h5py.Group):
            raise PipelineError(f"{path.name}: expected HDF5 groups at {GRID} and {IDENT}; run inspect_h5.py to review the found layout.")
        required_grid = (*pols, "xCoordinates", "yCoordinates", "xCoordinateSpacing", "yCoordinateSpacing", "projection", "mask")
        missing = [key for key in required_grid if key not in grid]
        if missing:
            raise PipelineError(f"{path.name}: missing polarization/grid datasets {missing} in {GRID}; found {list(grid.keys())}. Run inspect_h5.py.")
        for key in required_grid:
            if not isinstance(grid[key], h5py.Dataset):
                raise PipelineError(f"{path.name}: expected a dataset at {GRID}/{key}; found a group. Run inspect_h5.py.")
        for key, expected in [("productType", "GCOV"), ("radarBand", "L")]:
            value = scalar(ident, key, required=False)
            if value is not None and str(value).upper() != expected:
                raise PipelineError(f"{path.name}: {key}={value!r}; this processor accepts L-band GCOV only.")
        shape = grid[pols[0]].shape
        if len(shape) != 2 or not all(n > 0 for n in shape):
            raise PipelineError(f"{path.name}: expected nonempty 2D covariance grid; found {shape}.")
        for pol in pols:
            dataset = grid[pol]
            if dataset.shape != shape or dataset.dtype.kind != "f":
                raise PipelineError(f"{path.name}: mismatched grid or non-real power at {pol}: {dataset.shape}, {dataset.dtype}.")
        if grid["mask"].shape != shape or grid["mask"].dtype.kind not in "ui":
            raise PipelineError(f"{path.name}: mask must be an integer grid matching the covariance shape.")
        dx, dy = float(scalar(grid, "xCoordinateSpacing")), float(scalar(grid, "yCoordinateSpacing"))
        if dx <= 0 or dy >= 0:
            raise PipelineError(f"{path.name}: north-up grid required (x spacing positive, y spacing negative); found {dx}, {dy}.")
        x0 = check_coordinates(grid["xCoordinates"], dx, shape[1])
        y0 = check_coordinates(grid["yCoordinates"], dy, shape[0])
        try:
            crs = CRS.from_epsg(integer_metadata(grid, "projection", 1))
        except Exception as exc:
            raise PipelineError(f"{path.name}: invalid projection EPSG.") from exc
        # GCOV coordinate vectors locate pixel centers, not corner coordinates.
        transform = Affine(dx, 0, x0-dx/2, 0, dy, y0-dy/2)
        window = (0, shape[0], 0, shape[1])
        if aoi:
            native = transform_bounds("EPSG:4326", crs, *aoi, densify_pts=21)
            crop = from_bounds(*native, transform=transform)
            r0, c0 = max(0, math.floor(crop.row_off)), max(0, math.floor(crop.col_off))
            r1 = min(shape[0], math.ceil(crop.row_off+crop.height))
            c1 = min(shape[1], math.ceil(crop.col_off+crop.width))
            if r0 >= r1 or c0 >= c1:
                raise PipelineError(f"{path.name}: AOI does not intersect the product grid.")
            window = r0, r1, c0, c1
        date = iso_time(scalar(ident, "zeroDopplerStartTime"))
        end = iso_time(scalar(ident, "zeroDopplerEndTime"))
        if datetime.fromisoformat(end.replace("Z", "+00:00")) < datetime.fromisoformat(date.replace("Z", "+00:00")):
            raise PipelineError(f"{path.name}: acquisition end precedes start.")
        direction = str(scalar(ident, "orbitPassDirection")).upper()
        if direction not in {"ASCENDING", "DESCENDING"}:
            raise PipelineError(f"{path.name}: unknown pass direction {direction!r}.")
        maturity = scalar(ident, "dataMaturity", required=False)
        sidecar = Path(str(path)+".asf.json")
        if sidecar.exists():
            try:
                source_metadata = json.loads(sidecar.read_text(encoding="utf-8"))
                sidecar_maturity = source_metadata.get("dataMaturity")
                if maturity and sidecar_maturity and str(maturity).upper() != str(sidecar_maturity).upper():
                    raise PipelineError(f"{path.name}: conflicting HDF5 and ASF data maturity.")
                maturity = maturity or sidecar_maturity
            except (OSError, json.JSONDecodeError, AttributeError) as exc:
                raise PipelineError(f"{path.name}: invalid ASF metadata sidecar {sidecar.name}.") from exc
        result = Product(path, date, end, integer_metadata(ident, "absoluteOrbitNumber", 0),
                         integer_metadata(ident, "trackNumber", 1, 173), integer_metadata(ident, "frameNumber", 1, 176),
                         direction, str(scalar(ident, "productVersion")),
                         str(scalar(ident, "compositeReleaseId")), str(maturity or "UNKNOWN").upper(),
                         str(scalar(ident, "productSpecificationVersion", required=False) or "UNKNOWN"),
                         crs, transform, shape, window)
        if result.track <= 0 or result.frame <= 0 or result.orbit < 0 or not result.version or not result.release:
            raise PipelineError(f"{path.name}: invalid orbit/frame/track/version metadata.")
        return result


def reduced_grid(product: Product, max_size: int) -> tuple[Affine, tuple[int, int]]:
    r0, r1, c0, c1 = product.window
    height, width = r1-r0, c1-c0
    factor = max(1, math.ceil(max(height, width)/max_size))
    shape = math.ceil(height/factor), math.ceil(width/factor)
    transform = product.transform @ Affine.translation(c0, r0) @ Affine.scale(width/shape[1], height/shape[0])
    return transform, shape


def process_directory(input_dir: Path, out_dir: Path, *, pols: tuple[str, ...] = ("HHHH", "HVHV"),
                      max_size: int = 2048, db_ranges: dict[str, tuple[float, float]] | None = None,
                      aoi: tuple[float, float, float, float] | None = None,
                      allow_mixed_versions: bool = False, png_quantize: bool = False,
                      dry_run: bool = False, source_paths=None, open_source=None) -> dict[str, Any]:
    input_dir, out_dir = Path(input_dir), Path(out_dir)
    if not 1 <= max_size <= 8192:
        raise PipelineError("--max-size must be 1..8192 (default 2048; larger values use more memory).")
    if not pols or len(set(pols)) != len(pols) or any(p not in POL_NAMES for p in pols):
        raise PipelineError("--pols supports distinct HHHH,HVHV diagonal real-power datasets.")
    ranges = {**DEFAULT_DB_RANGES, **(db_ranges or {})}
    if any(k not in {"HH", "HV"} or len(v) != 2 or not all(math.isfinite(n) for n in v) or v[0] >= v[1]
           for k, v in ranges.items()):
        raise PipelineError("Invalid fixed dB ranges; use HH=min,max or HV=min,max with finite increasing values.")
    if aoi:
        aoi = parse_bbox(",".join(map(str, aoi)))
    if not input_dir.is_dir():
        raise PipelineError(f"Input folder does not exist: {input_dir}")
    paths = (sorted(Path(p) for p in source_paths) if source_paths is not None else
             sorted(p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in {".h5", ".hdf5"}))
    if not paths:
        raise PipelineError(f"No GCOV .h5 products in {input_dir}.")
    products = [inspect_product(path, pols, aoi, open_source=open_source) for path in paths]
    grouped: dict[str, list[Product]] = {}
    for product in products:
        grouped.setdefault(product.frame_id, []).append(product)
    # Complete preflight before writing outputs or loading covariance data.
    for frame_id, group in grouped.items():
        group.sort(key=lambda p: datetime.fromisoformat(p.date.replace("Z", "+00:00")))
        reference = group[0]
        seen_days: set[str] = set()
        for p in group:
            if p.date[:10] in seen_days:
                raise PipelineError(f"{frame_id}: duplicate products on the same day {p.date[:10]}; choose one processing version/acquisition to avoid filename collisions.")
            seen_days.add(p.date[:10])
            if p.crs != reference.crs or p.shape != reference.shape or not p.transform.almost_equals(reference.transform, precision=1e-6):
                raise PipelineError(f"{frame_id}: mismatched grids in {reference.path.name} and {p.path.name}; align products before differencing or process separately.")
        for earlier, later in zip(group, group[1:]):
            if earlier.version_key != later.version_key and not allow_mixed_versions:
                raise PipelineError(f"{frame_id}: mixed processing versions/maturity {earlier.version_key} vs {later.version_key}. Use consistent products or explicitly --allow-mixed-versions.")
    notes = ["Validated expected frequencyA GCOV hierarchy; run inspect_h5.py and verify the source spec before processing new product releases.",
             "Mask 0 (partially focused/invalid ensemble) and 255 (outside acquisition), nonpositive and nonfinite power are excluded.",
             "Bounded 512×512 source reads; valid linear power averaged before 10*log10. COGs and histograms describe the reduced grid, not every original-resolution pixel.",
             "Balanced integer multilook bins cover the entire crop; output grid preserves its exact extent. Non-divisible bin widths differ by at most one source pixel.",
             "PNG grayscale uses fixed polarization ranges; change RdBu_r uses fixed [-6,6] dB centered at zero. Nearest-neighbor display reprojection preserves reduced dB values.",
             "Histogram normalization divides in-range counts by all valid reduced pixels; underflow/overflow are reported separately. COG values remain unclipped.",
             "HV-HH is a later-acquisition cross-polarization log ratio, not temporal change or displacement. GCOV cannot measure earthquake displacement; use GUNW separately."]
    if any(p.maturity == "UNKNOWN" for p in products):
        notes.append("Data maturity UNKNOWN for some inputs: HDF5 lacks calibration maturity and ASF sidecar is absent. ProductVersion and compositeReleaseId are still compared; no maturity is inferred.")
    manifest: dict[str, Any] = {"schemaVersion": "1.0", "generated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "provenance": "derived", "source": "NISAR GCOV via ASF DAAC", "frames": [],
        "dbRanges": {p: list(ranges[p]) for p in (POL_NAMES[q] for q in pols)},
        "changeRangeDb": list(CHANGE_RANGE), "colorMaps": {"backscatter": "gray", "change": "RdBu_r"},
        "nominalRepeatDays": 12, "processingNotes": notes, "dryRun": dry_run}
    # Stage in a temporary directory, publish the manifest only after all rasters succeed.
    staging_parent = None if dry_run else out_dir.parent
    if not dry_run:
        out_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sar-waltz-", dir=staging_parent) as stage_name:
        stage = Path(stage_name)
        for frame_id, group in sorted(grouped.items()):
            reference = group[0]
            transform, shape = reduced_grid(reference, max_size)
            target = mercator_grid(reference.crs, transform, shape, max_size)
            target_transform, target_width, target_height = target
            # Bounds describe PNG's exact projected rectangular footprint, shared by all dates.
            bounds = geographic_bounds(CRS.from_epsg(3857), target_transform, (target_height, target_width))
            frame: dict[str, Any] = {"id": frame_id, "label": f"Track {reference.track} / Frame {reference.frame}",
                "track": reference.track, "frame": reference.frame, "passDirection": reference.direction,
                "crs": "EPSG:4326", "bounds": bounds, "overlayCrs": "EPSG:3857",
                "overlaySize": [target_width, target_height], "overlayTransform": list(target_transform)[:6],
                "acquisitions": [], "changeLayers": [],
                "mixedVersions": any(p.version_key != reference.version_key for p in group),
                "gaps": detect_gaps([p.date for p in group])}
            manifest["frames"].append(frame)
            previous: dict[str, np.ndarray] | None = None
            previous_product: Product | None = None
            if not dry_run:
                (stage/frame_id).mkdir()
            for n, product in enumerate(group, 1):
                LOG.info("%s acquisition %d/%d: %s", frame_id, n, len(group), product.path.name)
                acquisition: dict[str, Any] = {"date": product.date, "endDate": product.end, "orbit": product.orbit,
                    "productVersion": product.version, "compositeReleaseId": product.release,
                    "dataMaturity": product.maturity, "productSpecificationVersion": product.specification,
                    "productType": "GCOV", "sourceFile": product.path.name, "pols": [POL_NAMES[p] for p in pols],
                    "overlays": {}, "cog": {}, "roiGrid": {}, "histogramDb": {}, "statisticsDb": {},
                    "nativeCrs": str(product.crs), "analysisSize": [shape[1], shape[0]],
                    "analysisBounds": list(array_bounds(*shape, transform)), "analysisTransform": list(transform)[:6]}
                frame["acquisitions"].append(acquisition)
                current: dict[str, np.ndarray] = {}
                with (open_source or h5py.File)(product.path, "r") as h5:
                    for pol in pols:
                        label = POL_NAMES[pol]
                        name = f"{frame_id}/{product.date[:10].replace('-', '')}_{label}"
                        acquisition["overlays"][label], acquisition["cog"][label] = name+".png", name+".tif"
                        if dry_run:
                            continue
                        values = power_to_db(multilook_power(h5[f"{GRID}/{pol}"], h5[f"{GRID}/mask"], product.window, max_size))
                        current[label] = values
                        acquisition["histogramDb"][label] = histogram_db(values, ranges[label])
                        acquisition["statisticsDb"][label] = statistics_db(values)
                        # Lightweight, geographically aligned dB grid for approximate
                        # client-side point/region inspection. Never treat this overview
                        # sampling as a full-resolution scientific area estimate.
                        grid_size = 96
                        roi = np.full((grid_size,grid_size), np.nan, dtype=np.float32)
                        roi_transform = target_transform * Affine.scale(target_width/grid_size,target_height/grid_size)
                        reproject(source=values, destination=roi,
                                  src_transform=transform,src_crs=product.crs,src_nodata=np.nan,
                                  dst_transform=roi_transform,dst_crs=CRS.from_epsg(3857),dst_nodata=np.nan,
                                  resampling=Resampling.average)
                        grid_path = name+"_roi.json"
                        acquisition["roiGrid"][label] = grid_path
                        grid_values = [round(float(v), 3) if math.isfinite(float(v)) else None for v in roi.flat]
                        (stage/grid_path).write_text(json.dumps({"schemaVersion":"1.0","type":"gamma0-db",
                            "width":grid_size,"height":grid_size,"pol":label,
                            "date":product.date,"values":grid_values},allow_nan=False),encoding="utf-8")
                        write_cog(stage/(name+".tif"), values, product.crs, transform)
                        write_png(stage/(name+".png"), values, product.crs, transform, target, ranges[label], quantize=png_quantize)
                if previous_product:
                    mixed = previous_product.version_key != product.version_key
                    prefix = f"{frame_id}/change_{previous_product.date[:10].replace('-', '')}_{product.date[:10].replace('-', '')}"
                    for pol in pols:
                        label = POL_NAMES[pol]
                        name = prefix + ("" if label == POL_NAMES[pols[0]] else "_"+label)
                        change = {"from": previous_product.date, "to": product.date, "type": "dbDiff", "pol": label,
                                  "url": name+".png", "cog": name+".tif", "mixedVersions": mixed}
                        frame["changeLayers"].append(change)
                        if not dry_run:
                            values = current[label]-previous[label]  # type: ignore[index]
                            write_cog(stage/(name+".tif"), values, product.crs, transform)
                            write_png(stage/(name+".png"), values, product.crs, transform, target, CHANGE_RANGE, cmap="RdBu_r", quantize=png_quantize)
                    if set(pols) == {"HHHH", "HVHV"}:
                        name = prefix+"_HVHH"
                        frame["changeLayers"].append({"from": previous_product.date, "to": product.date,
                            "type": "hvhhDiff", "pol": "HV-HH", "url": name+".png", "cog": name+".tif", "mixedVersions": mixed,
                            "interpretation": "HV minus HH at the later acquisition (cross-polarization log ratio)."})
                        if not dry_run:
                            values = current["HV"]-current["HH"]
                            write_cog(stage/(name+".tif"), values, product.crs, transform)
                            write_png(stage/(name+".png"), values, product.crs, transform, target, CHANGE_RANGE, cmap="RdBu_r", quantize=png_quantize)
                previous, previous_product = current, product
        if any(frame["mixedVersions"] for frame in manifest["frames"]):
            notes.append("WARNING: mixed processing release/version/maturity comparisons explicitly allowed. Interpret these differences cautiously; affected pairs are flagged.")
        if not dry_run:
            (stage/"manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False)+"\n", encoding="utf-8")
            out_dir.mkdir(parents=True, exist_ok=True)
            for file in sorted(stage.rglob("*")):
                if file.is_file() and file.name != "manifest.json":
                    destination = out_dir/file.relative_to(stage)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    file.replace(destination)
            (stage/"manifest.json").replace(out_dir/"manifest.json")
            total_bytes = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
            LOG.info("Output: %.2f MiB (%d bytes) in %s", total_bytes/1024**2, total_bytes, out_dir)
            if total_bytes > 50_000_000:
                LOG.warning("Output exceeds 50 MB (50,000,000 bytes). Use --aoi, smaller --max-size, or --png-quantize; inspect stale outputs from earlier runs.")
        else:
            LOG.info("Dry run: validated %d files / %d frames; no science rasters read or output files written.", len(products), len(grouped))
    return manifest


def db_range_arg(value: str) -> tuple[str, tuple[float, float]]:
    try:
        key, raw = value.split("=", 1)
        numbers = tuple(float(v) for v in raw.split(","))
        if key not in {"HH", "HV"} or len(numbers) != 2 or not all(math.isfinite(v) for v in numbers) or numbers[0] >= numbers[1]:
            raise ValueError
        return key, numbers  # type: ignore[return-value]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Use --db-range HH=-25,0 or --db-range HV=-30,-5.") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Folder containing inspected L-band GCOV .h5 files")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--pols", default="HHHH,HVHV")
    parser.add_argument("--max-size", type=int, default=2048)
    parser.add_argument("--db-range", action="append", type=db_range_arg, default=[])
    parser.add_argument("--aoi", type=parse_bbox, help="west,south,east,north; crop before reading power")
    parser.add_argument("--allow-mixed-versions", action="store_true")
    parser.add_argument("--png-quantize", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        manifest = process_directory(args.input, args.out, pols=tuple(p.strip().upper() for p in args.pols.split(",")),
                                     max_size=args.max_size, db_ranges=dict(args.db_range), aoi=args.aoi,
                                     allow_mixed_versions=args.allow_mixed_versions,
                                     png_quantize=args.png_quantize, dry_run=args.dry_run)
        if args.dry_run:
            print(json.dumps(manifest, indent=2, allow_nan=False))
        return 0
    except (PipelineError, OSError) as exc:
        LOG.error("%s", exc)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
