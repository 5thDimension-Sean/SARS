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
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
import json
import multiprocessing
import os
import re
from pathlib import Path
import secrets
import shutil
import threading
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict

from pipeline.coordinate_contract import point_bbox, compatible_key, catalog_date

# A real worker needs a persistent process and local disk; running multiple
# uvicorn workers creates independent in-memory job maps. Use --workers 1.
BASE = Path(os.environ.get("PROCESSING_WORKDIR", "/tmp/tango-nisar-private")).resolve()
ORIGINS = [s.strip() for s in os.environ.get("PROCESSING_ALLOWED_ORIGINS", "").split(",") if s.strip()]
MAX_RAW = 3_000_000_000
MAX_TOTAL = 6_000_000_000
MAX_CATALOG = 100
MAX_ACTIVE = 1
TTL = timedelta(minutes=45)
MAX_JOB_SECONDS = 1200
MAX_REQUEST_BYTES = 1024
MAX_JOBS_PER_HOUR = 6
RECENT_JOBS: deque[float] = deque()
STOPPING = threading.Event()
POOL = ThreadPoolExecutor(max_workers=MAX_ACTIVE, thread_name_prefix="nisar-private")
LOCK = threading.RLock()

@asynccontextmanager
async def private_lifecycle(_app: FastAPI):
    # On a crash or worker restart, old HDF5s and previews must not survive.
    # Enforce a dedicated job directory; never recursively clean /tmp or /.
    if len(BASE.parts) < 3 or BASE in (Path("/"), Path("/tmp"), Path.home()):
        raise RuntimeError("PROCESSING_WORKDIR must name a dedicated private subdirectory")
    BASE.mkdir(parents=True, mode=0o700, exist_ok=True)
    BASE.chmod(0o700)
    for item in BASE.iterdir():
        if item.is_dir() and re.fullmatch(r"[A-Za-z0-9_-]{29,32}", item.name):
            shutil.rmtree(item, ignore_errors=True)
    STOPPING.clear()
    async def reap():
        while True:
            await asyncio.sleep(30)
            with LOCK:
                prune()
    reaper = asyncio.create_task(reap())
    try:
        yield
    finally:
        STOPPING.set()
        reaper.cancel()
        POOL.shutdown(wait=True, cancel_futures=True)
        for item in BASE.iterdir():
            if item.is_dir() and re.fullmatch(r"[A-Za-z0-9_-]{29,32}", item.name):
                shutil.rmtree(item, ignore_errors=True)


app = FastAPI(title="TANGO private processing API", docs_url=None, redoc_url=None,
              openapi_url=None, lifespan=private_lifecycle)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET","POST"], allow_headers=["Authorization","Content-Type","X-Earthdata-Token"], allow_credentials=False, max_age=300)


class BodyLimit:
    """Count streamed bodies too: Content-Length is attacker-controlled."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_REQUEST_BYTES:
                return await JSONResponse({"detail": "Request too large"}, status_code=413)(scope, receive, send)
            if not message.get("more_body", False):
                break
        consumed = False
        async def replay():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}
        await self.app(scope, replay, send)


app.add_middleware(BodyLimit)


@app.middleware("http")
async def no_store(request: Request, call_next):
    # No request bodies or Authorization headers should be logged upstream.
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, private, max-age=0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


class Location(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
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
    channel: Any = field(default=None, repr=False)

    def update(self, status: str, progress: str):
        self.status, self.progress = status, progress
        if self.channel is not None:
            self.channel.send(("progress", status, progress))


JOBS: dict[str, Job] = {}


def prune() -> None:
    now = datetime.now(timezone.utc)
    for job_id, job in list(JOBS.items()):
        if now - job.created > TTL and job.status not in ("queued", "searching", "downloading", "processing", "generating"):
            shutil.rmtree(job.directory, ignore_errors=True)
            del JOBS[job_id]


def discover(latitude: float, longitude: float):
    from pipeline.fetch_nisar import load_asf, search_kwargs, catalog_metadata, expected_size, product_filename
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
            date = catalog_date(str(props.get("startTime", "")), today - timedelta(days=180), today)
            key = compatible_key(props, m, filename)
            from shapely.geometry import Point, shape
            if not shape(p.geometry).covers(Point(longitude, latitude)):
                continue
            groups.setdefault(key, []).append((date, p, size))
        except (ValueError, KeyError, TypeError, AttributeError):
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
        from pipeline.nisar_to_overlays import process_directory
        with LOCK:
            job.update("searching", "Finding compatible acquisitions (dates selected automatically)")
        selected, bbox, count = discover(latitude, longitude)
        if selected is None:
            job.update("unavailable", "No compatible NISAR pair found for this point in the last 180 days")
            job.data = {"catalogCount": count, "scientificStatus": "NO_COMPATIBLE_PAIR"}
            return
        _, _, first, later, key = selected
        if shutil.disk_usage(BASE).free < first[2] + later[2] + 3_000_000_000:
            job.update("unavailable", "Not enough free worker storage for safe raw-data processing")
            return
        job.update("downloading", "Downloading two genuine NASA Earthdata GCOV files")
        # Explicit per-request token: never set process-wide environment.
        from pipeline.private_download import download_private
        receipts = download_private([first[1], later[1]], raw_dir, token, MAX_RAW, MAX_TOTAL)
        token = ""
        job.update("processing", "Checking radar grids and calculating aligned HH/HV differences")
        processed = process_directory(raw_dir, job.directory / "results", aoi=bbox,
                                      pols=("HHHH", "HVHV"), max_size=1800, png_quantize=True)
        frames = processed.get("frames") or []
        if len(frames) != 1 or len(frames[0].get("changeLayers") or []) < 2:
            raise ValueError("Unable to validate a common radar comparison grid")
        dates = [str(first[0]), str(later[0])]
        acquisitions = frames[0]["acquisitions"]
        frame = frames[0]
        west, south, east, north = frame["bounds"]
        if ((frame["track"], frame["frame"], frame["passDirection"]) != key[:3]
                or not (west <= longitude <= east and south <= latitude <= north)
                or any(a["compositeReleaseId"] != key[3] or a["dataMaturity"] != key[4] for a in acquisitions)
                or (key[5] is not None and any(a["productVersion"] != key[5] for a in acquisitions))):
            raise ValueError("Catalog and source HDF5 coverage or compatibility metadata disagree")
        if ([a["date"][:10] for a in acquisitions] != dates
                or acquisitions[0]["productSpecificationVersion"] == "UNKNOWN"
                or acquisitions[0]["productSpecificationVersion"] != acquisitions[1]["productSpecificationVersion"]):
            raise ValueError("Source acquisitions are not processing-compatible")
        job.update("generating", "Generating histograms, exploratory regions and provenance")
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
            "sourceFiles": receipts,
            "scientificStatus": "EXPLORATORY_NOT_CLEARED",
            "disclaimer": "Radar backscatter differences do not establish flooding, erosion, crop damage, or physical causes.",
            "manifest": processed,
            "images": data_images,
            "quality": evidence["quality"],
            "limitations": evidence["limitations"],
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
            "sources": evidence["polarizations"]["HH"]["observations"],
            "productVersion": acquisitions[0]["productVersion"],
            "productSpecificationVersion": acquisitions[0]["productSpecificationVersion"],
            "grid": {"crs": regions["crs"], "shape": regions["nativeShape"],
                     "pixelSpacingMeters": regions["pixelSpacingMeters"],
                     "pairedPixels": regions["pairedHHAndHVPixels"]},
        }
        # JSON does not contain credentials; raw HDF5 never exposed.
        job.update("ready", "Actual aligned NASA NISAR comparison available")
    except Exception:
        # Do not leak third-party exception details: may include signed URLs.
        job.update("failed", "Data processing or authentication failed. Verify access and try again.")
    finally:
        # Nothing is written into result outputs containing the bearer key.
        # Remove all original HDF5 downloads regardless of success.
        shutil.rmtree(raw_dir, ignore_errors=True)
        token = ""
        if job.status != "ready":
            for name in ("results", "custom-evidence", "custom-regions", "custom-preview"):
                shutil.rmtree(job.directory / name, ignore_errors=True)


def child_work(job_id: str, directory: str, latitude: float, longitude: float, channel):
    """Receive credentials over IPC, never a command line or environment variable."""
    try:
        JOBS[job_id] = Job(secret="", directory=Path(directory), channel=channel)
        token = channel.recv()
        work(job_id, latitude, longitude, token)
        token = ""
        job = JOBS[job_id]
        channel.send(("done", job.status, job.progress, job.data))
    finally:
        channel.close()


def run_job(job_id: str, latitude: float, longitude: float, token: str):
    """A killed subprocess bounds catalog, download and native HDF5 execution."""
    job = JOBS[job_id]
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe()
    process = context.Process(target=child_work, args=(job_id, str(job.directory), latitude, longitude, child))
    completed = False
    try:
        process.start()
        child.close()
        parent.send(token)
        token = ""
        deadline = time.monotonic() + MAX_JOB_SECONDS
        while time.monotonic() < deadline and not STOPPING.is_set():
            if parent.poll(0.25):
                message = parent.recv()
                with LOCK:
                    if message[0] == "done":
                        job.status, job.progress, job.data = message[1:]
                        completed = True
                        break
                    # 'ready' is published only after the complete result arrives.
                    if message[1] != "ready":
                        job.update(message[1], message[2])
            elif not process.is_alive():
                break
    except Exception:
        pass  # Never serialize exceptions which may contain credentialed URLs.
    finally:
        token = ""
        if process.pid is not None:
            if process.is_alive():
                process.terminate()
            process.join(timeout=5)
            if process.is_alive():
                process.kill()
                process.join()
        parent.close()
        child.close()
        shutil.rmtree(job.directory / "private-raw", ignore_errors=True)
        if not completed:
            with LOCK:
                job.update("failed", "Processing stopped or exceeded its time limit. Please try again.")
            for name in ("results", "custom-evidence", "custom-regions", "custom-preview"):
                shutil.rmtree(job.directory / name, ignore_errors=True)


def get_job(job_id: str, authorization: str | None) -> Job:
    job = JOBS.get(job_id)
    if not job or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(404, "Job not found")
    supplied = authorization[7:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", supplied) or not secrets.compare_digest(supplied, job.secret):
        raise HTTPException(404, "Job not found")
    if datetime.now(timezone.utc) - job.created > TTL and job.status in ("ready", "failed", "unavailable"):
        shutil.rmtree(job.directory, ignore_errors=True)
        JOBS.pop(job_id, None)
        raise HTTPException(404, "Job expired")
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
    if not x_earthdata_token or not re.fullmatch(r"[A-Za-z0-9._~+/=-]{20,2048}", x_earthdata_token):
        raise HTTPException(400, "An Earthdata token is required")
    try:
        point_bbox(payload.latitude, payload.longitude)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    BASE.mkdir(parents=True, mode=0o700, exist_ok=True)
    with LOCK:
        prune()
        now = time.monotonic()
        while RECENT_JOBS and RECENT_JOBS[0] <= now - 3600:
            RECENT_JOBS.popleft()
        if len(RECENT_JOBS) >= MAX_JOBS_PER_HOUR:
            raise HTTPException(429, "Hourly processing limit reached; try again later", headers={"Retry-After": "3600"})
        if sum(j.status in ("queued", "searching", "downloading", "processing", "generating") for j in JOBS.values()) >= MAX_ACTIVE:
            raise HTTPException(429, "Processing is busy; please try again later")
        job_id = secrets.token_urlsafe(22)
        secret = secrets.token_urlsafe(32)
        directory = BASE / job_id
        directory.mkdir(parents=True, mode=0o700, exist_ok=False)
        JOBS[job_id] = Job(secret=secret, directory=directory)
        try:
            POOL.submit(run_job, job_id, payload.latitude, payload.longitude, x_earthdata_token)
        except RuntimeError:
            JOBS.pop(job_id)
            directory.rmdir()
            raise HTTPException(503, "Worker is shutting down") from None
        RECENT_JOBS.append(now)
        return {"id": job_id, "accessToken": secret, "status": "queued", "expiresAt": (JOBS[job_id].created + TTL).isoformat()}


@app.get("/v1/jobs/{job_id}")
def status(job_id: str, authorization: str | None = Header(default=None)):
    with LOCK:
        prune()
        job = get_job(job_id, authorization)
        return {"status": job.status, "progress": job.progress,
                **({"result": job.data} if job.status in ("ready", "unavailable") else {})}


@app.get("/v1/jobs/{job_id}/image/{asset_path:path}")
def image(job_id: str, asset_path: str, authorization: str | None = Header(default=None)):
    job = get_job(job_id, authorization)
    if job.status != "ready" or not job.data:
        raise HTTPException(404, "Image unavailable")
    allowed = {path for images in job.data["images"].values() for path in images.values()}
    if asset_path not in allowed:
        raise HTTPException(404, "Image unavailable")
    path = (job.directory / asset_path).resolve()
    if not path.is_relative_to(job.directory) or not path.is_file():
        raise HTTPException(404, "Image unavailable")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "private, no-store"})


if __name__ == "__main__":
    import uvicorn
    BASE.mkdir(parents=True, mode=0o700, exist_ok=True)
    uvicorn.run(app, host="127.0.0.1", port=8090, workers=1, access_log=False)

