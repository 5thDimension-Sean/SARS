"use client";

import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loadProcessedOverlays, type ProcessedOverlay } from "@/lib/processed-overlays";
import { DATES } from "@/lib/nisar-browse";

export function ProcessedOverlayPanel({ map, onDisplay }: { map: MapLibreMap | null; onDisplay: (label: string) => void }) {
  const [overlays, setOverlays] = useState<ProcessedOverlay[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("Checking for processed products…");
  const [imageError, setImageError] = useState("");
  const overlay = overlays.find((item) => item.id === selected);

  useEffect(() => {
    const controller = new AbortController();
    // Resolves under the deployment prefix, including extensionless static routes.
    const directory = new URL(window.location.href);
    directory.pathname = directory.pathname.replace(/\/nisar-prototype(?:\.html)?\/?$/, "/data/manifest.json");
    directory.search = ""; directory.hash = "";
    void loadProcessedOverlays(directory.href, controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setOverlays(items ?? []);
      setMessage(items?.length
        ? "Processed image previews are available. Numerical analysis remains disabled pending scientific review."
        : "Numerical analysis unavailable. No processed GCOV overlays have been published; NASA browse imagery remains available.");
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("Processed manifest could not be loaded or validated. NASA browse imagery remains available; numerical analysis is unavailable.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!map || !overlay) return;
    let cancelled = false;
    const previousBounds = map.getMaxBounds();
    const minZoom = map.getMinZoom();
    const center = map.getCenter(), zoom = map.getZoom();
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      map.addSource("processed-preview", { type: "image", url: overlay.url, coordinates: overlay.coordinates });
      map.addLayer({ id: "processed-preview", type: "raster", source: "processed-preview", paint: { "raster-fade-duration": 0 } });
      DATES.forEach((date) => map.setLayoutProperty(date, "visibility", "none"));
      map.setMaxBounds(null);
      map.setMinZoom(0);
      map.fitBounds([overlay.coordinates[3], overlay.coordinates[1]], { padding: 30, duration: 0 });
      onDisplay(`${overlay.date} · ${overlay.pol} · Derived preview · QA ${overlay.qa.status}`);
    };
    image.onerror = () => { if (!cancelled) setImageError("Processed image could not load. NASA browse imagery is still displayed."); };
    image.src = overlay.url;
    return () => {
      cancelled = true;
      image.onload = image.onerror = null;
      if (!map.getStyle()) return;
      if (map.getLayer("processed-preview")) map.removeLayer("processed-preview");
      if (map.getSource("processed-preview")) map.removeSource("processed-preview");
      DATES.forEach((date) => map.setLayoutProperty(date, "visibility", "visible"));
      map.setMinZoom(minZoom);
      map.setMaxBounds(previousBounds ?? null);
      map.jumpTo({ center, zoom });
      onDisplay("");
    };
  }, [map, overlay, onDisplay]);

  return <section aria-label="Processed scientific products">
    <h2>Processed GCOV products</h2>
    <p role="status">{message}</p>
    {overlays.length > 0 && <>
      <label htmlFor="processed-overlay">Image preview </label>
      <select id="processed-overlay" value={selected} disabled={!map} onChange={(event) => { setImageError(""); setSelected(event.target.value); }}>
        <option value="">NASA GIBS browse imagery</option>
        {overlays.map((item) => <option key={item.id} value={item.id}>{item.label} · QA {item.qa.status}</option>)}
      </select>
      {imageError && <p role="alert">{imageError}</p>}
      {overlay && <>
        <p><strong>QA {overlay.qa.status}</strong>: {overlay.qa.summary} Supplied QA is not independent scientific clearance.</p>
        <p>{overlay.source} · {overlay.maturity} · Version {overlay.version}. Source: {overlay.sourceFile}.</p>
        <p>Derived gamma0 display, {overlay.pol}: black {overlay.range[0]} to white {overlay.range[1]} dB. Transparent pixels are nodata. PNG colors are not numerical measurements.</p>
        <details><summary>Processing notes</summary><ul>{overlay.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>
      </>}
    </>}
  </section>;
}
