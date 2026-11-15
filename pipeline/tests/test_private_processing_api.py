"""No network or Earthdata tokens needed: private worker security contract tests."""
from __future__ import annotations

import importlib
import json

from fastapi.testclient import TestClient


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
