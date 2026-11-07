"""Search ASF for L-band GCOV and download HDF5 products for offline processing.

Searches and dry runs need no Earthdata credentials. Downloads use an explicit
EARTHDATA_TOKEN or Earthdata's urs.earthdata.nasa.gov entry in a netrc file.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timezone
import importlib
import json
import logging
import math
import netrc
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any, Mapping, Sequence, TextIO
from urllib.parse import unquote, urlsplit

if __package__ in (None, ""):
    from common import PipelineError, parse_bbox
else:
    from .common import PipelineError, parse_bbox

LOG = logging.getLogger("sar_waltz.fetch")


def load_asf() -> Any:
    """Validate constants against the package actually installed in this venv."""
    try:
        asf = importlib.import_module("asf_search")
    except ImportError as exc:
        raise PipelineError("Install pipeline/requirements.txt in your virtual environment.") from exc
    for namespace, constant in (("DATASET", "NISAR"), ("PRODUCT_TYPE", "GCOV"), ("INSTRUMENT", "L_SAR")):
        if not getattr(getattr(asf, namespace, None), constant, None):
            raise PipelineError(f"Installed asf_search lacks {namespace}.{constant}; install the pinned requirements.")
    # ASF/Requests exceptions may include signed download URLs. Our progress and
    # error messages deliberately omit URLs, authentication values, and traces.
    library_logger = getattr(asf, "ASF_LOGGER", None)
    if library_logger is not None:
        library_logger.disabled = True
    return asf


def _bbox_argument(value: str) -> tuple[float, float, float, float]:
    try:
        return parse_bbox(value)
    except (PipelineError, ValueError) as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def _timestamp(value: str, *, end: bool = False) -> datetime:
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return datetime.combine(date.fromisoformat(value), time.max if end else time.min, timezone.utc)
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except ValueError as exc:
        raise PipelineError("Dates must be ISO dates or datetimes, for example 2026-07-03.") from exc


def search_kwargs(args: argparse.Namespace, asf: Any) -> dict[str, Any]:
    west, south, east, north = args.bbox
    start, end = _timestamp(args.start), _timestamp(args.end, end=True)
    if start > end:
        raise PipelineError("--start must precede --end.")
    query: dict[str, Any] = {
        "dataset": asf.DATASET.NISAR,
        "processingLevel": asf.PRODUCT_TYPE.GCOV,
        "instrument": asf.INSTRUMENT.L_SAR,
        "intersectsWith": f"POLYGON (({west} {south}, {east} {south}, {east} {north}, {west} {north}, {west} {south}))",
        "start": start.isoformat().replace("+00:00", "Z"),
        "end": end.isoformat().replace("+00:00", "Z"),
        "maxResults": args.max_results,
    }
    if args.track is not None:
        query["relativeOrbit"] = args.track
    if args.frame is not None:
        query["frame"] = args.frame
    if args.maturity is not None:
        query["dataMaturity"] = args.maturity
    return query


def product_filename(product: Any) -> str:
    properties = product.properties
    raw = properties.get("fileName") or urlsplit(str(properties.get("url") or "")).path.rsplit("/", 1)[-1]
    filename = unquote(str(raw)).split("?", 1)[0]
    if not filename or filename in (".", "..") or any(c in filename for c in ("/", "\\", "\x00", ":")):
        raise PipelineError("ASF returned an unsafe or missing filename.")
    if Path(filename).suffix.lower() not in (".h5", ".hdf5"):
        raise PipelineError("ASF returned a non-HDF5 primary file; refine the GCOV search.")
    return filename


def expected_size(properties: Mapping[str, Any], filename: str) -> int | None:
    """NISAR uses a per-file dictionary, unlike legacy ASF byte counts."""
    raw = properties.get("bytes")
    if isinstance(raw, Mapping):
        entry = raw.get(filename) or raw.get(Path(filename).stem)
        if entry is None:
            matches = [v for k, v in raw.items() if str(k).rsplit("/", 1)[-1] == filename]
            entry = matches[0] if len(matches) == 1 else None
        raw = entry.get("bytes") if isinstance(entry, Mapping) else entry
    try:
        number = float(raw)
        return int(number) if math.isfinite(number) and number > 0 and number.is_integer() else None
    except (TypeError, ValueError, OverflowError):
        return None


def catalog_metadata(product: Any) -> dict[str, Any]:
    properties = product.properties
    collection = properties.get("collectionName") or properties.get("shortName")
    maturity = properties.get("dataMaturity")
    if not maturity and collection:
        match = re.search(r"(?:^|_)(BETA|PROVISIONAL|VALIDATED)(?:_|$)", str(collection).upper())
        maturity = match.group(1) if match else None
    if not maturity:
        for attr in (getattr(product, "umm", None) or {}).get("AdditionalAttributes", []):
            if attr.get("Name") == "DATA_MATURITY" and attr.get("Values"):
                maturity = attr["Values"][0]
                break
    return {
        "source": "ASF DAAC",
        "granuleId": properties.get("sceneName") or properties.get("fileID"),
        "collectionName": collection,
        "dataMaturity": str(maturity).upper() if maturity else None,
        "productVersion": properties.get("productVersion"),
        "compositeReleaseId": properties.get("compositeReleaseId") or properties.get("crid"),
        "pgeVersion": properties.get("pgeVersion"),
    }


def _cell(value: Any) -> str:
    return " ".join(str(value if value is not None else "unknown").split())


def print_products(products: Sequence[Any], *, stream: TextIO = sys.stdout) -> None:
    rows = []
    for product in products:
        p, metadata = product.properties, catalog_metadata(product)
        size = expected_size(p, product_filename(product))
        version = metadata["productVersion"] or metadata["compositeReleaseId"] or metadata["pgeVersion"]
        rows.append([_cell(p.get("startTime")), _cell(p.get("frameNumber")), _cell(p.get("pathNumber")),
                     _cell(p.get("flightDirection")), f"{size / 1024**2:.1f} MiB" if size else "unknown",
                     _cell(version), _cell(metadata["dataMaturity"])])
    headers = ["DATE (UTC)", "FRAME", "TRACK", "PASS", "SIZE", "VERSION/CRID", "MATURITY"]
    widths = [max(len(headers[i]), *(len(row[i]) for row in rows)) if rows else len(headers[i]) for i in range(len(headers))]
    for row in [headers, ["-" * width for width in widths], *rows]:
        print("  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)), file=stream)


def authenticated_session(asf: Any) -> Any:
    """Do not print credentials or exception text from authentication libraries."""
    session = asf.ASFSession()
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    try:
        if token:
            return session.auth_with_token(token)
        configured = os.environ.get("NETRC")
        candidates = [Path(configured).expanduser()] if configured else [Path.home() / ".netrc", Path.home() / "_netrc"]
        selected = next((path for path in candidates if path.is_file()), None)
        if selected is None:
            raise PipelineError("Downloading requires EARTHDATA_TOKEN or an Earthdata entry in ~/.netrc.")
        credentials = netrc.netrc(str(selected)).authenticators("urs.earthdata.nasa.gov")
        if credentials is None or not credentials[0] or not credentials[2]:
            raise PipelineError("The netrc file needs a urs.earthdata.nasa.gov login and password entry.")
        return session.auth_with_creds(credentials[0], credentials[2])
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError("Earthdata authentication failed; check credentials, token expiry, and network access.") from exc


def _validate_hdf5(path: Path, expected: int | None) -> None:
    import h5py

    if not path.is_file() or path.stat().st_size == 0:
        raise PipelineError(f"Missing or empty download: {path.name}.")
    if expected is not None and path.stat().st_size != expected:
        raise PipelineError(f"Size mismatch for {path.name}; expected {expected} bytes, found {path.stat().st_size}.")
    if not h5py.is_hdf5(path):
        raise PipelineError(f"{path.name} is not an HDF5 file; authentication may have returned an HTML response.")
    try:
        # Header-only opening also rejects truncated HDF5 files whose eight-byte
        # signature survived. No dataset/raster reads occur during validation.
        with h5py.File(path, "r"):
            pass
    except OSError as exc:
        raise PipelineError(f"{path.name} has an unreadable or truncated HDF5 header.") from exc


def write_sidecar(product: Any, path: Path) -> None:
    sidecar = path.with_name(path.name + ".asf.json")
    metadata = catalog_metadata(product)
    metadata["fileName"] = path.name
    metadata["sizeBytes"] = path.stat().st_size
    # No URLs or session state are persisted: pre-signed URLs can contain secrets.
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".json.tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(metadata, handle, indent=2, allow_nan=False)
            handle.write("\n")
        temporary.replace(sidecar)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def download_products(products: Sequence[Any], out: Path, asf: Any) -> None:
    out.mkdir(parents=True, exist_ok=True)
    pending = []
    for product in products:
        target = out / product_filename(product)
        size = expected_size(product.properties, target.name)
        if target.exists():
            try:
                _validate_hdf5(target, size)
            except PipelineError as exc:
                raise PipelineError(f"Existing file failed validation: {target.name}. Move it aside before retrying; it was not overwritten.") from exc
            write_sidecar(product, target)
            LOG.info("Skipping existing %s (%s).", target.name, "catalog size verified" if size else "HDF5 signature verified; catalog size unavailable")
        else:
            pending.append((product, target, size))
    if not pending:
        return
    session = authenticated_session(asf)
    try:
        for i, (product, target, size) in enumerate(pending, 1):
            LOG.info("Downloading %s [%d/%d].", target.name, i, len(pending))
            with tempfile.TemporaryDirectory(prefix=".nisar-download-", dir=out) as folder:
                temporary = Path(folder) / target.name
                try:
                    asf.download_url(url=product.properties["url"], path=folder, filename=target.name, session=session)
                except Exception as exc:
                    raise PipelineError(f"Download failed for {target.name}; check Earthdata access and connectivity.") from exc
                _validate_hdf5(temporary, size)
                if target.exists():
                    raise PipelineError(f"Destination appeared during download: {target.name}; existing file was not overwritten.")
                temporary.replace(target)
            write_sidecar(product, target)
    finally:
        close = getattr(session, "close", None)
        if close is not None:
            close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--bbox", required=True, type=_bbox_argument, metavar="WEST,SOUTH,EAST,NORTH", help="WGS84 bounds; for negative west use --bbox=-81,25,-80,26")
    result.add_argument("--start", required=True, help="Inclusive ISO date or UTC datetime")
    result.add_argument("--end", required=True, help="Inclusive ISO date (whole day) or UTC datetime")
    result.add_argument("--track", type=int, help="NISAR relative orbit/track, 1-173")
    result.add_argument("--frame", type=int, help="NISAR frame, 1-176")
    result.add_argument("--maturity", choices=("BETA", "PROVISIONAL", "VALIDATED"), help="Optional catalog maturity filter")
    result.add_argument("--max-results", type=int, default=100, help="Result cap (default 100); increase deliberately for a larger search")
    result.add_argument("--out", type=Path, default=Path("pipeline/downloads"))
    result.add_argument("--dry-run", action="store_true", help="Search and print products without authentication or writing files")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        if args.track is not None and not 1 <= args.track <= 173:
            raise PipelineError("--track must be between 1 and 173.")
        if args.frame is not None and not 1 <= args.frame <= 176:
            raise PipelineError("--frame must be between 1 and 176.")
        if args.max_results < 1:
            raise PipelineError("--max-results must be positive.")
        asf = load_asf()
        query = search_kwargs(args, asf)
        LOG.info("Searching L-band NISAR GCOV with asf_search %s.", getattr(asf, "__version__", "unknown"))
        try:
            products = list(asf.search(**query))
        except Exception as exc:
            raise PipelineError("ASF search failed; check network access and search filters.") from exc
        products.sort(key=lambda product: str(product.properties.get("startTime") or ""))
        print_products(products, stream=sys.stdout)
        print(f"{len(products)} product(s); result cap {args.max_results}.")
        if len(products) >= args.max_results:
            LOG.warning("Result cap reached; increase --max-results or narrow dates/bounds to inspect remaining products.")
        if args.dry_run:
            print("DRY RUN: no authentication, downloads, or local file changes.")
        elif products:
            download_products(products, args.out.expanduser().resolve(), asf)
        return 0
    except (PipelineError, OSError) as exc:
        LOG.error("%s", exc)
        return 2
    except KeyboardInterrupt:
        LOG.error("Interrupted; completed files are preserved.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
