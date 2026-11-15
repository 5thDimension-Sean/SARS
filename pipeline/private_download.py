"""Bounded private downloads. Never persist or log credentialed URLs."""
from __future__ import annotations

from pathlib import Path
import hashlib
import time
from urllib.parse import urlsplit, urljoin

import requests

from pipeline.fetch_nisar import product_filename, expected_size, _validate_hdf5, write_sidecar

NASA_HOSTS = {"data.asf.alaska.edu", "datapool.asf.alaska.edu", "nisar.asf.earthdatacloud.nasa.gov"}


def permitted_url(url: str, *, redirect: bool = False) -> bool:
    try:
        value = urlsplit(url)
        host = (value.hostname or "").lower()
        if value.scheme != "https" or value.username or value.password or value.port not in (None, 443):
            return False
        if host in NASA_HOSTS:
            return True
        # Signed S3 redirects may carry the request, but NEVER the NASA bearer.
        return redirect and (host == "s3.amazonaws.com" or host.endswith(".s3.amazonaws.com")
                             or (".s3." in host and host.endswith(".amazonaws.com")))
    except ValueError:
        return False


def download_private(products, directory: Path, token: str, max_file: int, max_total: int):
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    total = 0
    receipts = []
    deadline = time.monotonic() + 900
    # Do not use netrc, ambient cookies or process-global authentication.
    with requests.Session() as session:
        session.trust_env = False
        for product in products:
            filename = product_filename(product)
            expected = expected_size(product.properties, filename)
            if not expected or expected > max_file or total + expected > max_total:
                raise ValueError("Catalog product exceeds processing limits")
            url = str(product.properties.get("url", ""))
            if not permitted_url(url):
                raise ValueError("Unsupported NASA download source")
            partial = directory / (filename + ".part")
            target = directory / filename
            try:
                for hop in range(6):
                    if time.monotonic() >= deadline:
                        raise ValueError("Download time limit exceeded")
                    host = urlsplit(url).hostname
                    headers = {"Authorization": "Bearer " + token} if host in NASA_HOSTS else {}
                    with session.get(url, headers=headers, stream=True, timeout=(15, 60), allow_redirects=False) as response:
                        if response.is_redirect:
                            next_url = urljoin(url, response.headers.get("Location", ""))
                            if not permitted_url(next_url, redirect=True):
                                raise ValueError("Unsupported download redirect")
                            url = next_url
                            continue
                        if response.status_code != 200:
                            raise ValueError("Earthdata authentication or download failed")
                        length = response.headers.get("Content-Length")
                        if length and int(length) != expected:
                            raise ValueError("Source length does not match catalog")
                        received = 0
                        digest = hashlib.sha256()
                        with partial.open("xb") as output:
                            for chunk in response.iter_content(chunk_size=1024 * 1024):
                                received += len(chunk)
                                if received > expected or total + received > max_total or time.monotonic() >= deadline:
                                    raise ValueError("Download resource limit exceeded")
                                output.write(chunk)
                                digest.update(chunk)
                        _validate_hdf5(partial, expected)
                        partial.replace(target)
                        total += received
                        write_sidecar(product, target)
                        receipts.append({"sourceFile": filename, "sizeBytes": received, "sha256": digest.hexdigest()})
                        break
                else:
                    raise ValueError("Too many download redirects")
            except Exception:
                # A requests exception may include the full signed URL. Drop it.
                partial.unlink(missing_ok=True)
                raise ValueError("Private NASA download failed; check access and try again") from None
    return receipts
