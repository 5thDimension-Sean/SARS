"""Read-only, bounded HTTPS ranges for authenticated NASA HDF5 inspection.

No disk cache, full-download fallback, or credential-bearing diagnostics.
Transfer counts are response-body bytes consumed (not TLS/HTTP overhead).
"""
from __future__ import annotations

from collections import OrderedDict
import io
import re
from urllib.parse import urlsplit, urljoin, unquote

import requests

# Verified from NASA's public NISAR browse redirect, 2026-11-06.
# No wildcard cloudfront.net / amazonaws.com trust. New hosts require review.
DATA_HOSTS = frozenset({'d1mv8zhcvry6x4.cloudfront.net'})
REDIRECT_CODES = (301, 302, 303, 307, 308)


class RangeSession(requests.Session):
    def resolve_redirects(self, *args, **kwargs):
        # Requests otherwise consumes redirect bodies while preparing Response.next,
        # even with allow_redirects=False. All redirects are handled manually here.
        return iter(())


def redirect_host(url):
    """Expose only a DNS hostname, never userinfo, paths or query strings."""
    try:
        host = urlsplit(url).hostname or ''
        return host if re.fullmatch(r'[a-z0-9.-]{1,253}', host) else '[invalid hostname]'
    except ValueError:
        return '[invalid hostname]'


def redirect_diagnostics(target, canonical):
    """Boolean evidence only; do not disclose signed URLs or path/query values."""
    try:
        p = urlsplit(target)
        key = urlsplit(canonical).path.removeprefix('/NISAR/')
        return {
            'parseable': True,
            'https': p.scheme == 'https',
            'hostAllowlisted': p.hostname in DATA_HOSTS,
            'portAllowed': p.port in (None,443),
            'noUserinfo': not p.username and not p.password,
            'noFragment': not p.fragment,
            'noControlCharacters': not any(ord(c) < 32 or ord(c) == 127 for c in target),
            # Protected-product routing may insert directories after the mapped
            # origin. Keep the exact catalog key; permit only plain, non-dot-led
            # intermediate segments (no traversal, escapes or empty segments).
            'strictProductPathMatches': bool(re.fullmatch(
                r'/s3-[a-f0-9]{32}/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*' + re.escape(key), p.path)),
            'productKeySuffixMatches': p.path.endswith('/' + key),
            'decodedProductKeySuffixMatches': unquote(p.path).endswith('/' + key),
            'mappedOriginPrefixMatches': bool(re.match(r'^/s3-[a-f0-9]{32}/', p.path)),
            'canonicalPathMatches': p.path == urlsplit(canonical).path,
        }
    except ValueError:
        return {'parseable': False}


def validate_redirect(target, canonical):
    checks = redirect_diagnostics(target, canonical)
    required = ('parseable', 'https', 'hostAllowlisted', 'portAllowed', 'noUserinfo',
                'noFragment', 'noControlCharacters', 'strictProductPathMatches')
    if not all(checks.get(key,False) for key in required):
        raise AccessError('Redirect destination rejected: host, HTTPS or product path not allowlisted.')


class AccessError(RuntimeError):
    """A safe diagnostic; never include requests exceptions or authenticated URLs."""


def validate_url(url: str) -> None:
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "nisar.asf.earthdatacloud.nasa.gov"
            or parsed.port not in (None, 443) or parsed.username or parsed.password
            or parsed.query or parsed.fragment
            or not parsed.path.startswith("/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/")
            or ".." in parsed.path or "%" in parsed.path):
        raise AccessError("Only canonical provisional NASA GCOV product URLs are allowed.")


class RangeReader(io.RawIOBase):
    def __init__(self, session, url: str, size: int, *, block_size: int = 1024**2,
                 cache_bytes: int = 8 * 1024**2, max_bytes: int = 64 * 1024**2):
        super().__init__()
        self.cache: OrderedDict[int, bytes] = OrderedDict()
        self.redirect_session = None
        validate_url(url)
        if (size <= 0 or block_size <= 0 or cache_bytes < block_size or max_bytes < block_size
                or cache_bytes > 8*1024**2 or max_bytes > 64*1024**2):
            raise ValueError("Invalid range/cache/transfer limits")
        self.session, self.url, self.size = session, url, size
        self.block_size, self.cache_limit, self.max_bytes = block_size, cache_bytes, max_bytes
        self.position = self.bytes_transferred = self.requests = self.cache_peak = 0
        self.etag: str | None = None
        self.last_status: int | None = None
        self.redirects = []
        self.range_responses = 0
        self.first_content_range = self.last_content_range = None
        self.last_error = None
        self._resolved_url = None  # Ephemeral signed URL; never included in audit.
        self.redirect_session = RangeSession()
        self.redirect_session.trust_env = False

    def _response(self, headers):
        url = self._resolved_url or self.url
        for hop in range(4):
            self.requests += 1
            if url == self.url:
                if isinstance(self.session, requests.Session):
                    request = self.session.prepare_request(requests.Request('GET',url,headers=headers))
                    response = self.redirect_session.send(request,stream=True,allow_redirects=False,
                                                          timeout=(10,30),proxies={},verify=True)
                else:  # Small injected test transports.
                    response = self.session.get(url, headers=headers, stream=True,
                                                allow_redirects=False, timeout=(10,30))
            else:
                validate_redirect(url, self.url)
                # Bare prepared Request: no bearer, cookies, netrc, session auth,
                # proxy credentials or authentication hooks inherited from EDL.
                request = requests.Request('GET',url,headers=headers).prepare()
                response = self.redirect_session.send(request,stream=True,allow_redirects=False,
                                                      timeout=(10,30),proxies={},verify=True)
            self.last_status = response.status_code
            if response.status_code not in REDIRECT_CODES:
                return response
            try:
                location = response.headers.get('Location','')
                target = urljoin(url,location) if location else ''
                event = {'status':response.status_code,'destinationHost':redirect_host(target),'allowed':False,
                         'validation':redirect_diagnostics(target,self.url)}
                self.redirects.append(event)
                validate_redirect(target,self.url)
                event['allowed'] = True
                if hop == 3:
                    raise AccessError('Redirect limit reached; no response body consumed.')
                self._resolved_url = url = target
            finally:
                response.close()
        raise AccessError('Redirect limit reached.')

    def readable(self): return True
    def seekable(self): return True
    def writable(self): return False
    def tell(self): return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        self._checkClosed()
        if whence not in (0, 1, 2): raise ValueError("Invalid seek mode")
        target = offset + (self.position if whence == 1 else self.size if whence == 2 else 0)
        if target < 0: raise ValueError("Negative seek")
        self.position = target
        return target

    def _block(self, index: int) -> bytes:
        if index in self.cache:
            self.cache.move_to_end(index)
            return self.cache[index]
        start = index * self.block_size
        end = min(start + self.block_size, self.size) - 1
        length = end - start + 1
        if self.bytes_transferred + length > self.max_bytes:
            self.last_error = 'Transfer budget exhausted; no full download attempted.'
            raise AccessError(self.last_error)
        headers = {"Range": f"bytes={start}-{end}", "Accept-Encoding": "identity"}
        if self.etag and not self.etag.startswith("W/"): headers["If-Match"] = self.etag
        try:
            with self._response(headers) as response:
                self.last_status = response.status_code
                if response.status_code in (401, 403):
                    raise AccessError("Authentication or signed URL rejected; response body not downloaded.")
                if response.status_code != 206:
                    raise AccessError("Server did not honor byte ranges; response body not downloaded.")
                match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", response.headers.get("Content-Range", ""))
                if not match or tuple(map(int, match.groups())) != (start, end, self.size):
                    raise AccessError("Unexpected Content-Range or changed product size.")
                if response.headers.get("Content-Encoding", "identity") != "identity":
                    raise AccessError("Encoded range response rejected.")
                if "text/html" in response.headers.get("Content-Type", ""):
                    raise AccessError("HTML authentication response rejected.")
                self.range_responses += 1
                self.last_content_range = response.headers['Content-Range']
                self.first_content_range = self.first_content_range or self.last_content_range
                etag = response.headers.get("ETag")
                if self.etag and etag != self.etag: raise AccessError("Product changed during reading.")
                self.etag = etag
                data = bytearray()
                # Raw bounded reads: a noncompliant server cannot stream a full product into RAM.
                while len(data) < length:
                    chunk = response.raw.read(min(65536, length - len(data)))
                    if not chunk: raise AccessError("Truncated range response.")
                    self.bytes_transferred += len(chunk)
                    data.extend(chunk)
        except AccessError as exc:
            self.last_error = str(exc)
            raise
        except Exception:
            self.last_error = 'NASA range request failed; network diagnostics withheld.'
            raise AccessError("NASA range request failed; network diagnostics withheld.") from None
        while self.cache and sum(map(len, self.cache.values())) + length > self.cache_limit:
            self.cache.popitem(last=False)
        self.cache[index] = bytes(data)
        self.cache_peak = max(self.cache_peak, sum(map(len, self.cache.values())))
        return self.cache[index]

    def read(self, size=-1):
        self._checkClosed()
        remaining = max(0, self.size - self.position)
        size = remaining if size is None or size < 0 else min(size, remaining)
        if size > self.cache_limit:
            self.last_error = 'Single read exceeds bounded buffer; full-file reads are forbidden.'
            raise AccessError(self.last_error)
        parts = []
        while size:
            index, offset = divmod(self.position, self.block_size)
            block = self._block(index)
            take = min(size, len(block) - offset)
            parts.append(block[offset:offset + take])
            self.position += take
            size -= take
        return b"".join(parts)

    def readinto(self, target):
        data = self.read(len(target))
        target[:len(data)] = data
        return len(data)

    def close(self):
        self.cache.clear()
        if self.redirect_session is not None:
            self.redirect_session.close()
        self._resolved_url = None
        super().close()

    def audit(self):
        return {"bodyBytesConsumed": self.bytes_transferred, "requests": self.requests,
                "cachePeakBytes": self.cache_peak, "cacheLimitBytes": self.cache_limit,
                "transferLimitBytes": self.max_bytes, "lastHttpStatus": self.last_status,
                "redirects": self.redirects, "verified206Responses": self.range_responses,
                "firstContentRange": self.first_content_range, "lastContentRange": self.last_content_range,
                "safeError": self.last_error,
                "fullFileChecksumVerified": False}
