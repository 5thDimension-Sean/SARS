"""Read only needed GCOV blocks over bounded, authenticated HTTP byte ranges.

Signed URLs and bearer credentials stay in memory. A range audit is explicitly
not a whole-file hash. No full download fallback is allowed on this fast path.
"""
from collections import OrderedDict
from contextlib import contextmanager
import hashlib
import io
import json
from pathlib import Path
import time
from urllib.parse import urljoin, urlsplit

import h5py
import requests

from pipeline.fetch_nisar import catalog_metadata, expected_size, product_filename
from pipeline.private_download import NASA_HOSTS, permitted_url


class HTTPRangeReader(io.RawIOBase):
    def __init__(self, url, size, token, *, block_size=1024*1024,
                 max_bytes=128*1024*1024, cache_bytes=32*1024*1024,
                 deadline=None, progress=None):
        super().__init__()
        if not permitted_url(url) or not isinstance(size, int) or size <= 0:
            raise ValueError("Unsupported NASA source")
        if block_size <= 0 or max_bytes <= 0 or cache_bytes < block_size:
            raise ValueError("Invalid range limits")
        self.url, self.size, self.token = url, size, token
        self.block_size, self.max_bytes = block_size, max_bytes
        self.max_cached = max(1, cache_bytes // block_size)
        self.deadline = deadline if deadline is not None else time.monotonic() + 180
        self.progress = progress
        self.position = self.transferred = 0
        self.etag = None
        self.cache = OrderedDict()
        self.audit = {}
        self.session = requests.Session()
        self.session.trust_env = False

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=0):
        position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset if whence == 2 else -1
        if position < 0:
            raise ValueError("Invalid source seek")
        self.position = position
        return position

    def _block(self, start):
        if start in self.cache:
            self.cache.move_to_end(start)
            return self.cache[start]
        end = min(start + self.block_size, self.size) - 1
        length = end - start + 1
        if time.monotonic() >= self.deadline or self.transferred + length > self.max_bytes:
            raise ValueError("Partial source read exceeded its byte or time limit")
        url = self.url
        try:
            for _ in range(6):
                headers = {"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"}
                if urlsplit(url).hostname in NASA_HOSTS:
                    headers["Authorization"] = "Bearer " + self.token
                if self.etag:
                    headers["If-Match"] = self.etag
                with self.session.get(url, headers=headers, stream=True, timeout=(10, 20), allow_redirects=False) as response:
                    if response.is_redirect:
                        url = urljoin(url, response.headers.get("Location", ""))
                        if not permitted_url(url, redirect=True):
                            raise ValueError("Unsupported source redirect")
                        continue
                    # Reject servers ignoring Range before reading a multi-GB body.
                    expected_range = f"bytes {start}-{end}/{self.size}"
                    if response.status_code != 206 or response.headers.get("Content-Range") != expected_range:
                        raise ValueError("The source did not return the exact requested byte range")
                    etag = response.headers.get("ETag")
                    if not etag or etag.startswith("W/") or (self.etag and self.etag != etag):
                        raise ValueError("Source identity is missing or changed")
                    if response.headers.get("Content-Encoding", "identity") != "identity":
                        raise ValueError("Unexpected source encoding")
                    payload = bytearray()
                    for chunk in response.iter_content(chunk_size=64*1024):
                        self.transferred += len(chunk)
                        payload.extend(chunk)
                        if len(payload) > length or self.transferred > self.max_bytes or time.monotonic() >= self.deadline:
                            raise ValueError("Partial source read exceeded its limits")
                    if len(payload) != length:
                        raise ValueError("Incomplete source byte range")
                    self.etag, self.url = etag, url
                    digest = hashlib.sha256(payload).hexdigest()
                    previous = self.audit.get(start)
                    entry = {"start": start, "end": end, "sha256": digest}
                    if previous and previous != entry:
                        raise ValueError("Source byte range changed")
                    self.audit[start] = entry
                    self.cache[start] = bytes(payload)
                    while len(self.cache) > self.max_cached:
                        self.cache.popitem(last=False)
                    if self.progress:
                        self.progress(self.transferred)
                    return bytes(payload)
            raise ValueError("Too many source redirects")
        except Exception:
            # requests exceptions can embed signed URLs. Never propagate them.
            raise ValueError("Unable to read a bounded NASA data block; retry or check access") from None

    def read(self, size=-1):
        if self.closed:
            raise ValueError("Source reader is closed")
        size = max(0, self.size-self.position) if size is None or size < 0 else min(size, max(0, self.size-self.position))
        if size > self.max_bytes:
            raise ValueError("Unbounded source read is not permitted")
        result = bytearray()
        while len(result) < size:
            start = self.position // self.block_size * self.block_size
            block = self._block(start)
            offset = self.position-start
            count = min(size-len(result), len(block)-offset)
            result.extend(block[offset:offset+count])
            self.position += count
        return bytes(result)

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)

    def receipt(self, name):
        ranges = [self.audit[k] for k in sorted(self.audit)]
        return {"sourceFile": name, "sourceSizeBytes": self.size,
                "accessMode": "HTTP_RANGE_SUBSET", "downloadedBytes": self.transferred,
                "uniqueBytesRead": sum(r["end"]-r["start"]+1 for r in ranges),
                "rangeCount": len(ranges), "rangeAudit": ranges,
                "rangeAuditSha256": hashlib.sha256(json.dumps(ranges, sort_keys=True).encode()).hexdigest(),
                "hashScope": "Only listed source byte ranges; not a whole-file SHA-256"}

    def close(self):
        self.token = self.url = ""
        if hasattr(self, "cache"):
            self.cache.clear()
        if hasattr(self, "session"):
            self.session.close()
        super().close()


@contextmanager
def open_private_products(products, directory: Path, token: str, progress=None):
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    readers = {}
    deadline = time.monotonic() + 180
    try:
        for i, product in enumerate(products, 1):
            name = product_filename(product)
            size = expected_size(product.properties, name)
            if not size or name in readers:
                raise ValueError("Missing source size or duplicate source")
            notify = (lambda count, index=i: progress(index, count)) if progress else None
            reader = HTTPRangeReader(str(product.properties.get("url", "")), size, token,
                                     deadline=deadline, progress=notify)
            readers[name] = reader
            if reader.read(8) != b"\x89HDF\r\n\x1a\n":
                raise ValueError("Source is not a supported HDF5 product")
            metadata = {**catalog_metadata(product), "fileName": name, "sourceSizeBytes": size,
                        "accessMode": "HTTP_RANGE_SUBSET"}
            (directory / (name + ".asf.json")).write_text(json.dumps(metadata, allow_nan=False), encoding="utf-8")

        @contextmanager
        def opener(path, mode="r"):
            if mode != "r" or Path(path).name not in readers:
                raise ValueError("Unexpected source read")
            reader = readers[Path(path).name]
            reader.seek(0)
            with h5py.File(reader, "r") as h5:
                yield h5

        yield [directory/name for name in readers], opener, lambda: [reader.receipt(name) for name, reader in readers.items()]
    finally:
        token = ""
        for reader in readers.values():
            reader.close()
