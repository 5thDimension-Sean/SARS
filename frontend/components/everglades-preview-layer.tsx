"use client";

import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type Polarization = "HH" | "HV";
type Acquisition = {
  date: string;
  conceptId: string;
  images: Record<Polarization, { filename: string; displayRangeDb: [number, number] }>;
};
type Manifest = {
  bounds: [number, number, number, number];
  scientificClearance: string;
  measurement: string;
  acquisitions: Acquisition[];
};

function checkManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object") throw new Error("Missing preview metadata");
  const m = value as Manifest;
  if (!Array.isArray(m.bounds) || m.bounds.length !== 4 || !m.bounds.every(Number.isFinite)) {
    throw new Error("Invalid geographic bounds");
  }
  const [w,s,e,n] = m.bounds;
  if (!(w >= -180 && e <= 180 && s >= -85.05 && n <= 85.05 && w < e && s < n)) {
    throw new Error("Invalid geographic extent");
  }
  if (!Array.isArray(m.acquisitions) || m.acquisitions.length !== 2) throw new Error("Expected two NISAR acquisitions");
  const dates = ["2026-09-30", "2026-10-12"];
  for (let i = 0; i < 2; i++) {
    const a = m.acquisitions[i];
    if (a.date !== dates[i] || typeof a.conceptId !== "string" || !/^G\d+-ASF$/.test(a.conceptId)) {
      throw new Error("Acquisition metadata does not match verified study");
    }
    for (const pol of ["HH", "HV"] as const) {
      const im = a.images?.[pol];
      if (!im || im.filename !== `${a.date.replaceAll("-", "")}_${pol}.png` ||
          !Array.isArray(im.displayRangeDb) || im.displayRangeDb.length !== 2 ||
          !im.displayRangeDb.every(Number.isFinite)) {
        throw new Error("Invalid preview image reference or scale");
      }
    }
  }
  if (typeof m.scientificClearance !== "string" || typeof m.measurement !== "string") {
    throw new Error("Missing scientific caveats");
  }
  return m;
}

export function EvergladesPreviewLayer({ map }: { map: MapLibreMap | null }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [directory, setDirectory] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("Checking NASA-derived preview data…");

  useEffect(() => {
    const controller = new AbortController();
    const file = new URL(window.location.href);
    file.pathname = file.pathname.replace(/\/nisar-prototype(?:\.html)?\/?$/, "/data/everglades-preview/preview-manifest.json");
    file.search = "";
    file.hash = "";
    const base = file.href.slice(0, file.href.lastIndexOf("/") + 1);
    void fetch(file.href, { signal: controller.signal, credentials: "omit", redirect: "error" })
      .then(async response => {
        if (!response.ok) throw new Error(`Preview metadata unavailable (${response.status})`);
        return checkManifest(await response.json());
      })
      .then(parsed => {
        if (!controller.signal.aborted) { setManifest(parsed); setDirectory(base); setMessage("Four authentic NISAR-derived HH/HV previews available."); }
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("No compatible numerical preview available. NASA browse imagery still works."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!map || !manifest || !selected) return;
    if (!map.isStyleLoaded()) return;
    const [index, pol] = selected.split(":");
    const a = manifest.acquisitions[Number(index)];
    const image = a?.images?.[pol as Polarization];
    if (!image) return;
    const [w,s,e,n] = manifest.bounds;
    const previousBounds = map.getMaxBounds();
    const previousMinZoom = map.getMinZoom();
    const previousCenter = map.getCenter();
    const previousZoom = map.getZoom();
    const sourceId = "verified-nisar-preview";
    let cancelled = false;
    let installed = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      try {
        map.addSource(sourceId, { type: "image", url: directory + image.filename,
          coordinates: [[w,n],[e,n],[e,s],[w,s]] });
        map.addLayer({ id: sourceId, type: "raster", source: sourceId,
          paint: { "raster-fade-duration": 0, "raster-opacity": 1 } });
        installed = true;
        map.setMaxBounds(null);
        map.setMinZoom(0);
        map.fitBounds([[w,s],[e,n]], { padding: 40, duration: 0, maxZoom: 14 });
        setMessage(`${a.date} ${pol} preview displayed. Scientific QA NOT CLEARED.`);
      } catch { setMessage("Map could not display the numerical preview; NASA browse imagery remains available."); }
    };
    probe.onerror = () => { if (!cancelled) setMessage("Preview PNG failed to load; NASA browse imagery remains available."); };
    probe.src = directory + image.filename;
    return () => {
      cancelled = true;
      probe.onload = probe.onerror = null;
      if (installed && map.getStyle()) {
        if (map.getLayer(sourceId)) map.removeLayer(sourceId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        map.setMinZoom(previousMinZoom);
        map.setMaxBounds(previousBounds ?? null);
        map.jumpTo({ center: previousCenter, zoom: previousZoom });
      }
    };
  }, [map, manifest, directory, selected]);

  return <section aria-label="NASA-derived numerical radar previews" style={{ padding: "12px 0" }}>
    <h2 style={{ fontSize: "1.1rem", fontWeight: 650, marginBottom: 6 }}>Scientific radar previews</h2>
    <p role="status">{message}</p>
    {manifest && <>
      <label htmlFor="nisar-preview-select">Observation and polarization: </label>
      <select id="nisar-preview-select" value={selected} disabled={!map}
        onChange={event => setSelected(event.target.value)}
        style={{ color: "inherit", background: "#20353d", padding: 8, border: "1px solid #78909c", maxWidth: "100%" }}>
        <option value="">NASA GIBS browse (color)</option>
        {manifest.acquisitions.map((a,i) => (["HH", "HV"] as const).map(pol =>
          <option key={`${i}:${pol}`} value={`${i}:${pol}`}>{a.date} · {pol} backscatter</option>))}
      </select>
      <p style={{ marginTop: 8 }}>NASA NISAR GCOV · {manifest.measurement}.</p>
      <p><strong>Scientific QA: {manifest.scientificClearance}.</strong> These are single-date measurement previews, not validated flood or environmental-change maps.</p>
      <details><summary>NASA source products</summary>
        {manifest.acquisitions.map(a => <p key={a.date}>{a.date}: {a.conceptId}</p>)}
        <p>Display scales: HH −25 to 0 dB, HV −30 to −5 dB.</p>
      </details>
    </>}
  </section>;
}
