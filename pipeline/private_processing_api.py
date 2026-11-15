"""Private, long-lived coordinate processing API for real NASA NISAR GCOV.

Run on a dedicated disk-backed Python worker, NOT on serverless Vercel or GitHub
Pages. No credentials are stored on disk, logged, or returned. The visitor
supplies their own Earthdata bearer token over TLS. Background execution keeps
it only in process memory and drops it after a job finishes.

Required: PROCESSING_ALLOWED_ORIGINS=https://tangosars.vercel.app
Run behind an HTTPS reverse proxy, set PROCESSING_WORKDIR to a private
ephemeral disk with >=12 GiB free, restrict network access and CPU resources.
This is a reference backend and is NOT active until an owner deploys it.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import secrets
import shutil
import threading
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict

from pipeline.fetch_nisar import load_asf, search_kwargs, catalog_metadata, expected_size, product_filename, download_products
from pipeline.nisar_to_overlays import process_directory

# A real worker needs a persistent process and local disk; running multiple
# uvicorn workers creates independent in-memory job maps. Use --workers 1.
BASE = Path(os.environ.get("PROCESSING_WORKDIR", "/tmp/tango-nisar-private")).resolve()
ORIGINS = [s.strip() for s in os.environ.get("PROCESSING_ALLOWED_ORIGINS", "").split(",") if s.strip()]
MAX_RAW = 3_000_000_000
MAX_TOTAL = 6_000_000_000
MAX_CATALOG = 100
MAX_ACTIVE = 1
TTL = timedelta(minutes=45)
POOL = ThreadPoolExecutor(max_workers=MAX_ACTIVE, thread_name_prefix="nisar-private")
LOCK = threading.RLock()

app = FastAPI(title="TANGO private processing API", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET","POST"], allow_headers=["Authorization","Content-Type","X-Earthdata-Token"], allow_credentials=False, max_age=300)


@app.middleware("http")
async def no_store(request: Request, call_next):
    # No request bodies or Authorization headers should be logged upstream.
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, private, max-age=0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)


@dataclass
class Job:
    secret: str
    directory: Path
    created: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "queued"
    progress: str = "Checking genuine published NISAR coverage"
    data: dict[str, Any] | None = None


JOBS: dict[str, Job] = {}


def prune() -> None:
    now = datetime.now(timezone.utc)
    for job_id, job in list(JOBS.items()):
        if now - job.created > TTL and job.status not in ("queued", "searching", "downloading", "processing"):
            shutil.rmtree(job.directory, ignore_errors=True)
            del JOBS[job_id]


def point_bbox(latitude: float, longitude: float) -> tuple[float, float, float, float]:
    # ~4 km square; capped footprint avoids massive scientific downloads.
    dx = 0.018 / max(0.3, __import__("math").cos(__import__("math").radians(latitude)))
    if longitude < -180 + dx or longitude > 180 - dx:
        raise ValueError("Choose a point away from the antimeridian for this preview")
    return (longitude - dx, latitude - 0.018, longitude + dx, latitude + 0.018)


def discover(latitude: float, longitude: float):
    asf = load_asf()
    bbox = point_bbox(latitude, longitude)
    today = datetime.now(timezone.utc).date()
    args = argparse.Namespace(bbox=bbox, start=str(today - timedelta(days=180)), end=str(today),
                              maturity="PROVISIONAL", track=None, frame=None, max_results=MAX_CATALOG)
    products = list(asf.search(**search_kwargs(args, asf)))
    if len(products) >= MAX_CATALOG:
        # A capped incomplete search cannot establish the best pair.
        raise ValueError("Catalog result limit reached; narrow the location or retry")
    groups: dict[tuple, list] = {}
    for p in products:
        try:
            filename = product_filename(p)
            if "_DHDH_A_" not in filename:
                continue
            size = expected_size(p.properties, filename)
            if not size or size > MAX_RAW:
                continue
            m = catalog_metadata(p)
            props = p.properties
            dt = str(props.get("startTime", ""))[:10]
            date = datetime.fromisoformat(dt).date()
            key = (str(props.get("pathNumber")), str(props.get("frameNumber")),
                   str(props.get("flightDirection")), str(m.get("compositeReleaseId")),
                   str(m.get("dataMaturity")), str(m.get("productVersion")))
            groups.setdefault(key, []).append((date, p, size))
        except (ValueError, KeyError, TypeError):
            continue
    options = []
    for key, group in groups.items():
        group.sort(key=lambda x: x[0])
        for i, first in enumerate(group):
            for later in group[i + 1:]:
                days = (later[0] - first[0]).days
                if 12 <= days <= 120 and first[2] + later[2] <= MAX_TOTAL:
                    # Maximize interval, while requiring acquisition mode,
                    # track/frame/pass/release agreement. No claim of cause.
                    options.append((days, -sum((first[2], later[2])), first, later, key))
    if not options:
        return None, bbox, len(products)
    best = max(options, key=lambda x: (x[0], x[1]))
    return best, bbox, len(products)


def work(job_id: str, latitude: float, longitude: float, token: str) -> None:
    job = JOBS[job_id]
    raw_dir = job.directory / "private-raw"
    try:
        with LOCK:
            job.status, job.progress = "searching", "Finding compatible acquisitions (dates selected automatically)"
        selected, bbox, count = discover(latitude, longitude)
        if selected is None:
            job.status, job.progress = "unavailable", "No compatible NISAR pair found for this point in the last 180 days"
            job.data = {"catalogCount": count, "scientificStatus": "NO_COMPATIBLE_PAIR"}
            return
        _, _, first, later, key = selected
        if shutil.disk_usage(BASE).free < first[2] + later[2] + 3_000_000_000:
            job.status, job.progress = "unavailable", "Not enough free worker storage for safe raw-data processing"
            return
        job.status, job.progress = "downloading", "Downloading two genuine NASA Earthdata GCOV files"
        asf = load_asf()
        # Explicit per-request session token: NEVER set process-wide environment.
        download_products([first[1], later[1]], raw_dir, asf, token=token)
        job.status, job.progress = "processing", "Checking radar grids and calculating aligned HH/HV differences"
        processed = process_directory(raw_dir, job.directory / "results", aoi=bbox,
                                      pols=("HHHH", "HVHV"), max_size=1800, png_quantize=True)
        frames = processed.get("frames") or []
        if len(frames) != 1 or len(frames[0].get("changeLayers") or []) < 2:
            raise ValueError("Unable to validate a common radar comparison grid")
        dates = [str(first[0]), str(later[0])]
        from pipeline.generate_unified_evidence import generate
        (job.directory / "results" / "discovery.json").write_text(json.dumps({
            "status": "EXPLORATORY_PROCESSED_NOT_QA_CLEARED",
            "selected": [{"date": str(item[0]), "sceneName": str(item[1].properties.get("sceneName") or item[1].properties.get("fileID"))}
                         for item in (first, later)],
        }), encoding="utf8")
        generate("custom", job.directory)
        evidence = json.loads((job.directory / "custom-evidence" / "evidence.json").read_text())
        regions = json.loads((job.directory / "custom-regions" / "regions.json").read_text())
        frame = frames[0]
        data_images = {
            pol: {
                "before": "custom-preview/" + dates[0].replace("-", "") + "_" + pol + ".png",
                "after": "custom-preview/" + dates[1].replace("-", "") + "_" + pol + ".png",
                "difference": "custom-regions/" + pol + "_difference_exploratory.png",
            } for pol in ("HH", "HV")
        }
        job.data = {
            "dates": dates, "track": key[0], "frame": key[1],
            "passDirection": key[2], "release": key[3],
            "coordinates": {"latitude": latitude, "longitude": longitude},
            "catalogCount": count,
            "scientificStatus": "EXPLORATORY_NOT_CLEARED",
            "disclaimer": "Radar backscatter differences do not establish flooding, erosion, crop damage, or physical causes.",
            "manifest": processed,
            "images": data_images,
            "evidence": {
                pol: {"observations": evidence["polarizations"][pol]["observations"],
                      "bins": evidence["polarizations"][pol]["histogramBins"],
                      "differenceOfRegionalMeansDb": evidence["polarizations"][pol]["differenceOfRegionalMeansDb"],
                      "differenceOfRegionalMediansDb": evidence["polarizations"][pol]["differenceOfRegionalMediansDb"]}
                for pol in ("HH", "HV")
            },
            "regions": [{"id": r["id"], "title": r["title"], "stats": r["stats"]}
                        for r in regions["regions"]],
            "bounds": frame["bounds"],
            "grid": {"crs": regions["crs"], "shape": regions["nativeShape"],
                     "pixelSpacingMeters": regions["pixelSpacingMeters"],
                     "pairedPixels": regions["pairedHHAndHVPixels"]},
        }
        # JSON does not contain credentials; raw HDF5 never exposed.
        job.status, job.progress = "ready", "Actual aligned NASA NISAR comparison available"
    except Exception:
        # Do not leak third-party exception details: may include signed URLs.
        job.status, job.progress = "failed", "Data processing or authentication failed. Verify access and try again."
    finally:
        # Nothing is written into result outputs containing the bearer key.
        # Remove all original HDF5 downloads regardless of success.
        shutil.rmtree(raw_dir, ignore_errors=True)


def get_job(job_id: str, authorization: str | None) -> Job:
    job = JOBS.get(job_id)
    if not job or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(404, "Job not found")
    if not secrets.compare_digest(authorization[7:], job.secret):
        raise HTTPException(404, "Job not found")
    return job


@app.get("/v1/health")
def health():
    return {"status": "ok", "processingEnabled": bool(ORIGINS)}


@app.post("/v1/jobs", status_code=202)
def create_job(payload: Location, x_earthdata_token: str | None = Header(default=None),
               request: Request = None):
    # Origin/CORS alone is not authentication; use single-use opaque job token
    # and cap processing to one job at a time. Reject browsers without origin.
    origin = request.headers.get("origin", "") if request else ""
    if not ORIGINS or origin not in ORIGINS:
        raise HTTPException(403, "Origin not permitted")
    if not x_earthdata_token or not 20 <= len(x_earthdata_token) <= 2048 or any(x in x_earthdata_token for x in "\r\n"):
        raise HTTPException(400, "An Earthdata token is required")
    BASE.mkdir(parents=True, mode=0o700, exist_ok=True)
    with LOCK:
        prune()
        if sum(j.status in ("queued", "searching", "downloading", "processing") for j in JOBS.values()) >= MAX_ACTIVE:
            raise HTTPException(429, "Processing is busy; please try again later")
        job_id = secrets.token_urlsafe(22)
        secret = secrets.token_urlsafe(32)
        directory = BASE / job_id
        directory.mkdir(parents=True, mode=0o700, exist_ok=False)
        JOBS[job_id] = Job(secret=secret, directory=directory)
        POOL.submit(work, job_id, payload.latitude, payload.longitude, x_earthdata_token)
        return {"id": job_id, "accessToken": secret, "status": "queued"}


@app.get("/v1/jobs/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)):
    with LOCK:
        prune()
        job = get_job(job_id, authorization)
        return {"status": job.status, "progress": job.progress,
                **({"result": job.data} if job.status in ("ready", "unavailable") else {})}


@app.get("/v1/jobs/{job_id}/image/{filename}")
def image(job_id: str, filename: str, authorization: str | None = Header(default=None)):
    job = get_job(job_id, authorization)
    if job.status != "ready" or not filename.endswith(".png"):
        raise HTTPException(404, "Image unavailable")
    # Only PNGs named by the verified published manifest are accessible.
    manifest = job.data["manifest"] if job.data else {}
    allowed: set[str] = set()
    for frame in manifest.get("frames", []):
        allowed.update(str(a.get("overlays", {}).get(p, "")) for a in frame.get("acquisitions", []) for p in ("HH", "HV"))
        allowed.update(str(x.get("url", "")) for x in frame.get("changeLayers", []))
    if filename not in allowed or "/" in filename or "\\" in filename:
        raise HTTPException(404, "Image unavailable")
    path = job.directory / "results" / filename
    if not path.is_file():
        raise HTTPException(404, "Image unavailable")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "private, no-store"})


if __name__ == "__main__":
    import uvicorn
    BASE.mkdir(parents=True, mode=0o700, exist_ok=True)
    uvicorn.run(app, host="127.0.0.1", port=8090, workers=1, access_log=False)
