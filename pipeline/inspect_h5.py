"""Print HDF5 structure and metadata without reading dataset/raster values."""

from __future__ import annotations

import argparse
import math
from pathlib import Path
import sys
from typing import Any, Sequence, TextIO

import h5py
import numpy as np


def _attribute_text(value: Any, limit: int = 500) -> str:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if isinstance(value, np.ndarray):
        value = value.tolist()
    if isinstance(value, np.generic):
        value = value.item()
    text = repr(value)
    return text if len(text) <= limit else text[:limit] + " ... [truncated]"


def inspect_file(path: Path, *, stream: TextIO = sys.stdout, max_attribute_items: int = 64) -> None:
    """Follow hard links once; describe soft/external links without opening them.

    Dataset shape/dtype/chunk metadata comes from the object header. Dataset
    __getitem__/read_direct are never used, including for identification scalars.
    Large attributes are described instead of loading their full values.
    """
    with h5py.File(path, "r") as handle:
        print(f"FILE {path.name}", file=stream)
        visited: dict[int, str] = {}

        def attributes(obj: h5py.Group | h5py.Dataset, indent: str) -> None:
            for key in sorted(obj.attrs.keys()):
                attribute_id = obj.attrs.get_id(key)
                try:
                    shape, dtype = attribute_id.shape, attribute_id.dtype
                    count = math.prod(shape) if shape else 1
                finally:
                    attribute_id.close()
                if count > max_attribute_items:
                    value = f"shape={shape} dtype={dtype} [value not read; {count} items]"
                else:
                    value = _attribute_text(obj.attrs[key])
                print(f"{indent}@{key}: {value}", file=stream)

        def walk(obj: h5py.Group | h5py.Dataset, name: str, depth: int) -> None:
            indent = "  " * depth
            address = h5py.h5o.get_info(obj.id).addr
            if address in visited:
                print(f"{indent}{name} [HARD LINK -> {visited[address]}]", file=stream)
                return
            visited[address] = obj.name
            if isinstance(obj, h5py.Dataset):
                print(f"{indent}{name} [DATASET] shape={obj.shape} dtype={obj.dtype} chunks={obj.chunks} compression={obj.compression}", file=stream)
            else:
                print(f"{indent}{name} [GROUP]", file=stream)
            attributes(obj, indent + "  ")
            if isinstance(obj, h5py.Group):
                for child_name in sorted(obj.keys()):
                    link = obj.get(child_name, getlink=True)
                    if isinstance(link, h5py.SoftLink):
                        print(f"{indent}  {child_name} [SOFT LINK -> {link.path}]", file=stream)
                    elif isinstance(link, h5py.ExternalLink):
                        print(f"{indent}  {child_name} [EXTERNAL LINK -> {link.filename}:{link.path}; not opened]", file=stream)
                    else:
                        walk(obj[child_name], child_name, depth + 1)

        walk(handle, "/", 0)
        print("Metadata only: no dataset values or raster pixels were read.", file=stream)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, nargs="+", help="One or more local HDF5 products")
    parser.add_argument("--max-attribute-items", type=int, default=64, help="Describe larger array attributes without loading them (default 64)")
    args = parser.parse_args(argv)
    if args.max_attribute_items < 0:
        print("ERROR: --max-attribute-items must be nonnegative.", file=sys.stderr)
        return 2
    status = 0
    for path in args.input:
        try:
            inspect_file(path.expanduser(), stream=sys.stdout, max_attribute_items=args.max_attribute_items)
        except (OSError, ValueError, KeyError) as exc:
            print(f"ERROR: Cannot inspect {path.name}: {exc}", file=sys.stderr)
            status = 2
    return status


if __name__ == "__main__":
    raise SystemExit(main())
