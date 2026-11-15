"""Serve the reviewed static frontend beside the private API for a free demo.

Only frontend/out is public. Job directories, original products and credentials
remain outside this mount and retain the API's per-job authorization checks.
"""
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

from pipeline.private_processing_api import app


@app.middleware("http")
async def public_page_headers(request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/v1/"):
        # API responses forbid all active content. The reviewed static export
        # needs its bundled scripts/styles to render the coordinate form.
        response.headers["Content-Security-Policy"] = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    return response


class ExportedPages(StaticFiles):
    """Resolve Next's extensionless route links to their exported HTML files."""

    async def get_response(self, path, scope):
        if path not in ("", ".") and not Path(path).suffix:
            try:
                return await super().get_response(path + ".html", scope)
            except HTTPException as error:
                if error.status_code != 404:
                    raise
        return await super().get_response(path, scope)


EXPORT = Path(__file__).resolve().parents[1] / "frontend" / "out"
# Mount last: /v1/jobs and protected PNG routes must win over static routing.
app.mount("/", ExportedPages(directory=EXPORT, html=True, check_dir=False), name="demo-frontend")
