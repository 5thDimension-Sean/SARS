"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import everglades from "@/public/data/everglades-preview/preview-manifest.json";
import louisiana from "@/public/data/louisiana-preview/preview-manifest.json";
import california from "@/public/data/california-preview/preview-manifest.json";
import { STUDIES, fmtDate, type Bounds, type StudyConfig } from "@/lib/investigation";
import { footprints, graticule } from "@/lib/globe-data";
import { prefersReducedMotion } from "@/lib/prefs";
import styles from "./story-map.module.css";

const BOUNDS: Record<StudyConfig["id"], Bounds> = { everglades: everglades.bounds as Bounds, louisiana: louisiana.bounds as Bounds, california: california.bounds as Bounds };
const centerOf = (b: Bounds): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; // the footprint centre, so dot, box and flight agree
const OVERVIEW = { center: [-98, 28] as [number, number], zoom: 1.45 };
const FOCUS_ZOOM = 7.4;
// NASA Blue Marble (a real NASA product) served by GIBS, shown in grayscale. If it cannot load, the globe still works.
const BLUE_MARBLE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

type StepId = "overview" | StudyConfig["id"];

/** A 3D globe whose camera flies (out, across, then in) to each study location as the story scrolls. */
function Globe({ active, onPick, onUnavailable }: { active: StepId; onPick: (id: StepId) => void; onUnavailable: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [markerEls] = useState(() => new Map<string, HTMLButtonElement>());
  const cb = useRef({ onPick, onUnavailable });
  useEffect(() => { cb.current = { onPick, onUnavailable }; });

  useEffect(() => {
    let cancelled = false, instance: MapLibreMap | undefined;
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !box.current) return;
      try {
        lib.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        instance = new lib.Map({
          container: box.current, center: OVERVIEW.center, zoom: OVERVIEW.zoom, minZoom: 1, maxZoom: 9, pitch: 0, dragRotate: false, pitchWithRotate: false,
          scrollZoom: false, doubleClickZoom: false, cooperativeGestures: window.matchMedia("(pointer: coarse)").matches, // wheel always scrolls the page
          attributionControl: { compact: true, customAttribution: "Globe imagery: NASA GIBS (Blue Marble)" },
          style: {
            version: 8, projection: { type: "globe" },
            sources: {
              bluemarble: { type: "raster", tiles: [BLUE_MARBLE], tileSize: 256, maxzoom: 8 },
              graticule: { type: "geojson", data: graticule(15) },
              footprints: { type: "geojson", data: footprints(Object.values(BOUNDS)) },
            },
            layers: [
              { id: "sphere", type: "background", paint: { "background-color": "#17171a" } },
              { id: "bluemarble", type: "raster", source: "bluemarble", paint: { "raster-saturation": -1, "raster-brightness-max": 0.62, "raster-contrast": 0.1, "raster-fade-duration": 400 } },
              { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#ffffff", "line-opacity": 0.14, "line-width": 0.6 } },
              { id: "footprints", type: "line", source: "footprints", paint: { "line-color": "#ffffff", "line-width": 1.5 } },
            ],
          },
        });
        instance.getCanvas().setAttribute("aria-label", "3D globe showing the three study locations. Drag to rotate.");
        instance.getCanvas().style.cursor = "grab";
        instance.on("error", (e) => { if ((e as { sourceId?: string }).sourceId !== "bluemarble") return; /* imagery is optional */ });
        const sync = () => { if (box.current && instance) box.current.dataset.view = `${instance.getCenter().lng.toFixed(1)},${instance.getCenter().lat.toFixed(1)},${instance.getZoom().toFixed(1)}`; };
        instance.on("move", sync);
        instance.once("load", () => {
          if (cancelled || !instance) return;
          for (const s of STUDIES) {
            const el = document.createElement("button");
            el.type = "button"; el.className = styles.marker; el.dataset.place = s.id;
            el.setAttribute("aria-label", `${s.label}: show this stop`);
            el.innerHTML = '<i></i><b></b>'; (el.lastElementChild as HTMLElement).textContent = s.short;
            el.addEventListener("click", () => cb.current.onPick(s.id));
            markerEls.set(s.id, el);
            new lib.Marker({ element: el }).setLngLat(centerOf(BOUNDS[s.id])).addTo(instance);
          }
          sync(); setMap(instance);
        });
      } catch { cb.current.onUnavailable(); }
    }).catch(() => cb.current.onUnavailable());
    return () => { cancelled = true; instance?.remove(); markerEls.clear(); };
  }, [markerEls]);

  // The camera follows the story: zoom out, travel, zoom in (flyTo), or jump when motion is reduced.
  useEffect(() => {
    if (!map) return;
    const target = active === "overview" ? OVERVIEW : { center: centerOf(BOUNDS[active]), zoom: FOCUS_ZOOM };
    if (prefersReducedMotion()) map.jumpTo({ center: target.center, zoom: target.zoom });
    else map.flyTo({ center: target.center, zoom: target.zoom, duration: active === "overview" ? 2400 : 3600, curve: 1.7, essential: true });
    markerEls.forEach((el, id) => { el.dataset.active = String(id === active); el.dataset.overview = String(active === "overview"); });
  }, [map, active, markerEls]);

  return <div ref={box} className={styles.globe} data-ready={!!map}>{!map && <span className={styles.loading} role="status">Loading globe…</span>}</div>;
}

// ---- flat fallback (no WebGL): the original equirectangular drawing
const W = 840, H = 500, LON0 = -128, LON1 = -72, LAT0 = 22, LAT1 = 49, ZOOM = 2.4;
const project = ([lon, lat]: [number, number]) => ({ x: ((lon - LON0) / (LON1 - LON0)) * W, y: ((LAT1 - lat) / (LAT1 - LAT0)) * H });
function FlatMap({ active, onPick }: { active: StepId; onPick: (id: StepId) => void }) {
  const study = STUDIES.find((s) => s.id === active), focus = study ? project(study.center) : null, zoom = focus ? ZOOM : 1;
  const tx = focus ? W / 2 - focus.x * ZOOM : 0, ty = focus ? H / 2 - focus.y * ZOOM : 0;
  return <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of the three study locations in the United States" className={styles.svg} data-overview={active === "overview"}>
    <g className={styles.camera} style={{ transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }}>
      {[-120, -112, -104, -96, -88, -80].map((l) => <line key={`lo${l}`} className={styles.grid} x1={project([l, LAT0]).x} x2={project([l, LAT1]).x} y1={0} y2={H} />)}
      {[25, 31, 37, 43].map((l) => <line key={`la${l}`} className={styles.grid} y1={project([LON0, l]).y} y2={project([LON0, l]).y} x1={0} x2={W} />)}
      {STUDIES.map((s) => { const p = project(s.center), on = s.id === active;
        return <g key={s.id} className={styles.place} data-active={on} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`${s.label}: show this stop`} aria-pressed={on}
          onClick={() => onPick(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(s.id); } }}>
          <circle className={styles.pulse} r={5} /><circle className={styles.dot} r={4} /><circle className={styles.hit} r={16} /><text className={styles.label} x={9} y={4}>{s.short}</text></g>; })}
    </g>
  </svg>;
}

/** Placeholder story map: a long scroll runway that flies a 3D globe between the three real locations. */
export function StoryMap() {
  const [active, setActive] = useState<StepId>("overview");
  const [flat, setFlat] = useState(false);
  const steps = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) setActive(((e.target as HTMLElement).dataset.id ?? "overview") as StepId); }, { rootMargin: "-45% 0px -45% 0px" });
    Object.values(steps.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const go = (id: StepId) => steps.current[id]?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });

  return <section className={styles.story} aria-labelledby="story-title">
    <div className={styles.head}>
      <h2 id="story-title">Three places, two dates each.</h2>
      <p>This story is a placeholder. The text for each stop is a draft slot; the locations and dates are real.</p>
    </div>
    <div className={styles.layout}>
      <div className={styles.stage}>{flat ? <FlatMap active={active} onPick={go} /> : <Globe active={active} onPick={go} onUnavailable={() => setFlat(true)} />}</div>
      <ol className={styles.steps}>
        <li ref={(el) => { steps.current.overview = el; }} data-id="overview" data-active={active === "overview"} className={`${styles.step} ${styles.intro}`}>
          <h3>Start from orbit.</h3>
          <p>Keep scrolling. The globe travels to each place we have radar for, and you can drag it to look around.</p>
        </li>
        {STUDIES.map((s) => <li key={s.id} ref={(el) => { steps.current[s.id] = el; }} data-id={s.id} data-active={s.id === active} className={styles.step}>
          <h3>{s.label}</h3>
          <p>Two NISAR acquisitions, {fmtDate(s.dates[0])} and {fmtDate(s.dates[1])}. HH and HV backscatter, with three candidate regions to inspect.</p>
          <Link href={`/nisar-prototype#${s.id}`}>Open this investigation</Link>
        </li>)}
        <li className={styles.runway} aria-hidden="true" />
      </ol>
    </div>
  </section>;
}
