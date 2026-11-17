"""No network or Earthdata tokens needed: private worker security contract tests."""
from __future__ import annotations

import importlib
import json
import pytest
from datetime import timedelta

from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def isolated_jobs(monkeypatch):
    mod = importlib.import_module("pipeline.private_processing_api")
    monkeypatch.setattr(mod, "JOBS", {})
    monkeypatch.setattr(mod, "RECENT_JOBS", mod.deque())
    monkeypatch.setattr(mod, "ORIGINS", ["https://tangosars.vercel.app"])


def test_key_never_returned_and_no_credentials_persist(monkeypatch, tmp_path):
    mod = importlib.import_module("pipeline.private_processing_api")
    monkeypatch.setattr(mod, "BASE", tmp_path)
    monkeypatch.setattr(mod.POOL, "submit", lambda *args, **kwargs: None)
    # Origin list is supplied before application middleware creation.
    client = TestClient(mod.app)
    token = "NASA-secret-token-example-for-tests-only"
    good = client.post("/v1/jobs", json={"latitude": 25.5, "longitude": -80.8},
                       headers={"Origin": "https://tangosars.vercel.app",
                                "X-Earthdata-Token": token})
    assert good.status_code == 202, good.text
    data = good.json()
    assert "accessToken" in data and token not in good.text
    assert good.headers["cache-control"].startswith("no-store")
    job = mod.JOBS[data["id"]]
    assert job.data is None
    assert not list(tmp_path.glob("**/*.*"))
    result = client.get("/v1/jobs/" + data["id"], headers={"Authorization": "Bearer " + data["accessToken"]})
    assert result.status_code == 200 and result.json()["status"] == "queued"
    assert token not in json.dumps(result.json())
    assert client.get("/v1/jobs/" + data["id"], headers={"Authorization": "Bearer bad"}).status_code == 404
    assert client.get("/v1/jobs/" + data["id"]).status_code == 404
    assert client.get("/v1/jobs/" + data["id"] + "/image/custom-preview/a.png",
                      headers={"Authorization": "Bearer " + data["accessToken"]}).status_code == 404


def test_rejects_missing_key_invalid_coordinate_or_untrusted_origin():
    from pipeline.private_processing_api import app
    client = TestClient(app)
    origin = {"Origin": "https://tangosars.vercel.app"}
    assert client.post("/v1/jobs", json={"latitude": 45, "longitude": 50}, headers=origin).status_code == 400
    assert client.post("/v1/jobs", json={"latitude": 90, "longitude": 50},
                       headers={**origin, "X-Earthdata-Token": "x"*40}).status_code == 422
    assert client.post("/v1/jobs", json={"latitude": 45, "longitude": 50, "start": "2026-01-01"},
                       headers={**origin, "X-Earthdata-Token": "x"*40}).status_code == 422
    assert client.post("/v1/jobs", json={"latitude": 45, "longitude": 50},
                       headers={"Origin": "https://untrusted.example", "X-Earthdata-Token": "x"*40}).status_code == 403


def test_bbox_bounded_and_metadata_noncause():
    from pipeline.private_processing_api import point_bbox
    bbox = point_bbox(25.5, -80.8)
    assert bbox[0] < -80.8 < bbox[2]
    assert bbox[1] < 25.5 < bbox[3]


def test_body_size_chunked_requests_and_strict_coordinates():
    from pipeline.private_processing_api import app
    client = TestClient(app)
    headers = {"Origin": "https://tangosars.vercel.app", "X-Earthdata-Token": "x" * 40}
    for payload in ({"latitude": "25.5", "longitude": -80.8}, {"latitude": True, "longitude": 0}, {"latitude": 0, "longitude": 180}):
        assert client.post("/v1/jobs", json=payload, headers=headers).status_code == 422
    response = client.post("/v1/jobs", content=iter([b"x" * 600, b"y" * 600]), headers=headers)
    assert response.status_code == 413
    assert response.headers["cache-control"].startswith("no-store")


def test_hourly_limit_and_generating_jobs_consume_capacity(monkeypatch, tmp_path):
    mod = importlib.import_module("pipeline.private_processing_api")
    monkeypatch.setattr(mod, "BASE", tmp_path)
    monkeypatch.setattr(mod.POOL, "submit", lambda *args: None)
    client = TestClient(mod.app)
    headers = {"Origin": "https://tangosars.vercel.app", "X-Earthdata-Token": "x" * 40}
    args = {"latitude": 25.5, "longitude": -80.8}
    first = client.post("/v1/jobs", json=args, headers=headers).json()
    mod.JOBS[first["id"]].status = "generating"
    assert client.post("/v1/jobs", json=args, headers=headers).status_code == 429
    mod.JOBS[first["id"]].status = "failed"
    mod.RECENT_JOBS.extend([mod.time.monotonic()] * mod.MAX_JOBS_PER_HOUR)
    assert client.post("/v1/jobs", json=args, headers=headers).status_code == 429


def test_result_isolation_image_allowlist_and_expiry(monkeypatch, tmp_path):
    mod = importlib.import_module("pipeline.private_processing_api")
    monkeypatch.setattr(mod, "BASE", tmp_path)
    secret = "a" * 43
    job = mod.Job(secret=secret, directory=tmp_path / "private")
    job.directory.mkdir()
    (job.directory / "preview.png").write_bytes(b"test-only")
    job.status, job.data = "ready", {"images": {"HH": {"before": "preview.png"}}}
    mod.JOBS["test"] = job
    client = TestClient(mod.app)
    good = {"Authorization": "Bearer " + secret}
    assert client.get("/v1/jobs/test/image/preview.png", headers=good).status_code == 200
    assert client.get("/v1/jobs/test/image/private-raw/data.h5", headers=good).status_code == 404
    assert client.get("/v1/jobs/test", headers={"Authorization": "Bearer " + "b" * 43}).status_code == 404
    assert client.get("/v1/jobs/test", headers=[(b"Authorization", b"Bearer \xff")]).status_code == 404
    job.created -= mod.TTL + timedelta(seconds=1)
    assert client.get("/v1/jobs/test", headers=good).status_code == 404
    assert not job.directory.exists()


def test_hard_deadline_removes_raw_files_and_marks_failure(monkeypatch, tmp_path):
    mod = importlib.import_module("pipeline.private_processing_api")
    job = mod.Job(secret="a" * 43, directory=tmp_path)
    mod.JOBS["timeout"] = job
    raw = tmp_path / "private-raw"
    raw.mkdir()
    (raw / "test.h5").write_bytes(b"test-only")
    events = []
    class Pipe:
        def send(self, value): pass
        def close(self): pass
    class Process:
        pid = 1
        def start(self): pass
        def is_alive(self): return "terminated" not in events
        def terminate(self): events.append("terminated")
        def join(self, **kwargs): pass
    context = type("Context", (), {"Pipe": lambda self: (Pipe(), Pipe()), "Process": lambda self, **kwargs: Process()})()
    monkeypatch.setattr(mod.multiprocessing, "get_context", lambda _: context)
    monkeypatch.setattr(mod, "MAX_JOB_SECONDS", 0)
    mod.run_job("timeout", 25.5, -80.8, "test-only-secret")
    assert job.status == "failed" and events == ["terminated"]
    assert not raw.exists()

