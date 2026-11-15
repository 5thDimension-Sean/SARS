"""Bounded range access and identical science outputs from synthetic sources."""
from contextlib import contextmanager
import io
import re
from types import SimpleNamespace

import h5py
import numpy as np
import pytest
import rasterio

from pipeline import private_ranges as ranges
from pipeline.nisar_to_overlays import process_directory


def fake_session(monkeypatch, payloads, *, mode="good"):
    calls = []
    class Response:
        def __init__(self, url, headers):
            self.is_redirect = "asf.alaska.edu" in url
            self.status_code = 303 if self.is_redirect else 200 if mode == "ignored" else 206
            self.headers = {"Location": "https://d1mv8zhcvry6x4.cloudfront.net/" + url.rsplit("/", 1)[-1]}
            self.payload = b""
            if not self.is_redirect:
                payload = payloads[url.rsplit("/", 1)[-1]]
                a, b = map(int, re.fullmatch(r"bytes=(\d+)-(\d+)", headers["Range"]).groups())
                self.payload = payload[a:b+1]
                self.headers = {"Content-Range": f"bytes {a}-{b}/{len(payload)}", "ETag": '"stable-test-source"'}
                if mode == "wrong-range": self.headers["Content-Range"] = "bytes 0-0/1"
                if mode == "changed" and sum(not c[0].startswith("https://data.asf") for c in calls) > 1:
                    self.headers["ETag"] = '"different-source"'
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def iter_content(self, **kwargs):
            assert self.status_code != 200, "A server ignoring Range must be rejected before reading its body"
            yield self.payload
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def close(self): pass
        def get(self, url, **kwargs):
            calls.append((url, kwargs["headers"]))
            return Response(url, kwargs["headers"])
    monkeypatch.setattr(ranges.requests, "Session", Session)
    return calls


def test_seek_cache_redirect_credentials_and_audit(monkeypatch):
    payload = bytes(range(256)) * 100
    calls = fake_session(monkeypatch, {"test.h5": payload})
    with ranges.HTTPRangeReader("https://data.asf.alaska.edu/test.h5", len(payload), "secret-test-only",
                                block_size=1024, cache_bytes=2048) as reader:
        reader.seek(100)
        assert reader.read(20) == payload[100:120]
        reader.seek(110)
        assert reader.read(5) == payload[110:115]
        assert len(calls) == 2  # NASA redirect + one block, then cached read.
        reader.seek(-30, 2)
        assert reader.read(30) == payload[-30:]
        receipt = reader.receipt("test.h5")
        assert receipt["downloadedBytes"] < len(payload)
        assert "sha256" not in receipt  # Must never claim a whole-file digest.
        assert "not a whole-file" in receipt["hashScope"]
        assert len(receipt["rangeAudit"]) == 2
    assert reader.token == "" and not reader.cache
    assert calls[0][1]["Authorization"] == "Bearer secret-test-only"
    assert all("Authorization" not in headers for url, headers in calls if "cloudfront.net" in url)


@pytest.mark.parametrize("mode", ["ignored", "wrong-range", "changed"])
def test_rejects_unsafe_or_changed_range_responses(monkeypatch, mode):
    fake_session(monkeypatch, {"test.h5": b"x" * 4096}, mode=mode)
    with ranges.HTTPRangeReader("https://data.asf.alaska.edu/test.h5", 4096, "never-echo",
                                block_size=1024, cache_bytes=1024) as reader:
        with pytest.raises(ValueError) as error:
            reader.read(2048)
        assert "never-echo" not in str(error.value)


def test_byte_budget_is_enforced_before_an_extra_request(monkeypatch):
    calls = fake_session(monkeypatch, {"test.h5": b"x" * 4096})
    with ranges.HTTPRangeReader("https://data.asf.alaska.edu/test.h5", 4096, "test-only",
                                block_size=1024, cache_bytes=1024, max_bytes=1024) as reader:
        assert len(reader.read(100)) == 100
        count = len(calls)
        reader.seek(2048)
        with pytest.raises(ValueError): reader.read(100)
        assert len(calls) == count


def test_range_sources_produce_identical_grids_without_downloading_unused_data(monkeypatch, gcov_factory, tmp_path):
    values = np.random.default_rng(19).uniform(0.02, 0.2, (256, 256)).astype("float32")
    paths = [gcov_factory("first.h5", hh=values, maturity="PROVISIONAL"),
             gcov_factory("later.h5", date="2026-07-15T12:00:00Z", hh=values*1.1, maturity="PROVISIONAL")]
    for path in paths:
        with h5py.File(path, "a") as h5:
            h5.create_dataset("UNUSED_SYNTHETIC_DATA", data=np.zeros(8*1024*1024, dtype="u1"))
    payloads = {p.name: p.read_bytes() for p in paths}
    calls = fake_session(monkeypatch, payloads)
    local = process_directory(paths[0].parent, tmp_path / "local")
    products = [SimpleNamespace(properties={"fileName": p.name, "url": "https://data.asf.alaska.edu/"+p.name,
                  "bytes": p.stat().st_size, "dataMaturity": "PROVISIONAL"}, umm={}) for p in paths]
    private = tmp_path / "private"
    with ranges.open_private_products(products, private, "private-test-only") as (remote_paths, opener, receipts):
        remote = process_directory(private, tmp_path / "remote", source_paths=remote_paths, open_source=opener)
        audit = receipts()
    assert not list(private.glob("*.h5"))
    assert all(r["downloadedBytes"] < r["sourceSizeBytes"] / 2 for r in audit)
    assert "private-test-only" not in "".join(p.read_text() for p in private.iterdir())
    for i in (0, 1):
        a, b = (m["frames"][0]["acquisitions"][i] for m in (local, remote))
        assert a["analysisTransform"] == b["analysisTransform"]
        assert a["histogramDb"] == b["histogramDb"]
        for pol in ("HH", "HV"):
            with rasterio.open(tmp_path / "local" / a["cog"][pol]) as first, rasterio.open(tmp_path / "remote" / b["cog"][pol]) as second:
                np.testing.assert_array_equal(first.read(1), second.read(1))
