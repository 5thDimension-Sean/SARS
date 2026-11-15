"""The free demo exposes only the reviewed export, never private worker data."""
import asyncio

import httpx
from starlette.applications import Starlette
from starlette.routing import Mount

from pipeline import demo_server
from pipeline.demo_server import ExportedPages


def test_export_routes_and_private_paths(tmp_path):
    public = tmp_path / "out"
    public.mkdir()
    (public / "index.html").write_text("PUBLIC_HOME")
    (public / "coordinates.html").write_text("PUBLIC_COORDINATES")
    (tmp_path / "private.h5").write_text("PRIVATE_SOURCE")
    app = Starlette(routes=[Mount("/", ExportedPages(directory=public, html=True))])

    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/")).text == "PUBLIC_HOME"
            assert (await client.get("/coordinates")).text == "PUBLIC_COORDINATES"
            for path in ("/private.h5", "/%2e%2e/private.h5", "/.env", "/pipeline/private_processing_api.py"):
                response = await client.get(path)
                assert response.status_code == 404
                assert "PRIVATE_SOURCE" not in response.text
    asyncio.run(check())


def test_static_page_can_render_while_api_retains_restrictive_policy(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("PUBLIC_HOME")
    monkeypatch.setattr(demo_server.app.routes[-1], "app", ExportedPages(directory=tmp_path, html=True))

    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=demo_server.app), base_url="http://test") as client:
            home = await client.get("/")
            assert home.status_code == 200
            assert "default-src 'none'" not in home.headers["content-security-policy"]
            assert "object-src 'none'" in home.headers["content-security-policy"]
            health = await client.get("/v1/health")
            assert health.status_code == 200
            assert "default-src 'none'" in health.headers["content-security-policy"]
            assert (await client.get("/v1/jobs/unknown")).status_code == 404
    asyncio.run(check())
