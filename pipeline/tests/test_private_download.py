from types import SimpleNamespace

import h5py
import pytest

from pipeline import private_download as download


@pytest.mark.parametrize("url", ["http://data.asf.alaska.edu/a", "https://data.asf.alaska.edu.evil.test/a", "https://user:pass@data.asf.alaska.edu/a", "https://127.0.0.1/a", "file:///etc/passwd", "https://data.asf.alaska.edu:444/a"])
def test_download_source_allowlist(url):
    assert not download.permitted_url(url)


def test_s3_redirect_never_receives_earthdata_bearer(monkeypatch, tmp_path):
    source = tmp_path / "fixture.h5"
    with h5py.File(source, "w") as h5:
        h5.create_dataset("SYNTHETIC_TEST_ONLY", data=[1, 2, 3])
    payload = source.read_bytes()
    calls = []
    class Response:
        def __init__(self, redirect=False):
            self.is_redirect = redirect
            self.status_code = 302 if redirect else 200
            self.headers = {"Location": "https://test-bucket.s3.amazonaws.com/test.h5?signature=private"} if redirect else {"Content-Length": str(len(payload))}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def iter_content(self, **kwargs): yield payload
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response(redirect=len(calls) == 1)
    monkeypatch.setattr(download.requests, "Session", Session)
    entry = SimpleNamespace(properties={"fileName": "NISAR_TEST.h5", "url": "https://data.asf.alaska.edu/test.h5", "bytes": len(payload)})
    download.download_private([entry], tmp_path / "private", "test-secret", 1_000_000, 2_000_000)
    assert calls[0][1]["headers"] == {"Authorization": "Bearer test-secret"}
    assert calls[1][1]["headers"] == {}
    assert calls[0][1]["allow_redirects"] is False
    assert (tmp_path / "private" / "NISAR_TEST.h5").is_file()
    sidecar = (tmp_path / "private" / "NISAR_TEST.h5.asf.json").read_text()
    assert "test-secret" not in sidecar and "signature" not in sidecar


def test_oversized_stream_is_removed_and_error_is_sanitized(monkeypatch, tmp_path):
    class Response:
        is_redirect = False
        status_code = 200
        headers = {}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def iter_content(self, **kwargs): yield b"x" * 11
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, *args, **kwargs): return Response()
    monkeypatch.setattr(download.requests, "Session", Session)
    entry = SimpleNamespace(properties={"fileName": "NISAR_TEST.h5", "url": "https://data.asf.alaska.edu/test.h5?secret=never-echo", "bytes": 10})
    with pytest.raises(ValueError) as error:
        download.download_private([entry], tmp_path / "private", "never-echo", 20, 20)
    assert "never-echo" not in str(error.value)
    assert not list((tmp_path / "private").iterdir())
