"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Map as MapLibreMap, Marker, LngLatBoundsLike, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  cornersBounds, dataUrl, fmtDate, padBounds, rasterCorners, ringBounds,
  type Bounds, type LonLat, type Pol, type PreviewSet, type RegionSet, type StudyConfig, POLS,
} from "@/lib/investigation";
import { ATTRIBUTION, STUDY_BOUNDS, tileUrl, type BrowseDate } from "@/lib/nisar-browse";
import styles from "./investigation.module.css";

export type ViewMode = "swipe" | "side" | "difference";
const toQuad = ([w, s, e, n]: Bounds): [LonLat, LonLat, LonLat, LonLat] => [[w, n], [e, n], [e, s], [w, s]];
const centroid = (ring: LonLat[]): LonLat => {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
};
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Handles { before: MapLibreMap | null; after: MapLibreMap; markers: Map<string, Marker[]> }
interface Props {
  study: StudyConfig; regions: RegionSet; preview: PreviewSet | null;
  pol: Pol; mode: ViewMode; selectedId: string; onSelect: (id: string) => void;
  gibsReady: boolean; gibsVisible: boolean; onGibsFail: () => void;
  onProblem: (message: string) => void; onAfterMap: (map: MapLibreMap | null) => void;
  resetSignal: number;
}

/**
 * Two cameras kept in lock-step: "before" and "after" maps show the measured radar previews on the same
 * geographic grid. Layout (swipe curtain, side by side, or single difference map) is pure CSS, so toggling
 * modes never reloads or resamples data. The raster layers use nearest-neighbour sampling: no smoothing.
 */
export function InvestigationMap({ study, regions, preview, pol, mode, selectedId, onSelect, gibsReady, gibsVisible, onGibsFail, onProblem, onAfterMap, resetSignal }: Props) {
  const beforeEl = useRef<HTMLDivElement>(null);
  const afterEl = useRef<HTMLDivElement>(null);
  const [handles, setHandles] = useState<Handles | null>(null);
  const [swipe, setSwipe] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);
  const [regionsVisible, setRegionsVisible] = useState(true);
  const [position, setPosition] = useState("Move over the map for coordinates");
  const fullButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const change = () => { setFullscreen(!!document.fullscreenElement); if (!document.fullscreenElement) fullButton.current?.focus(); };
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const frame = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onGibsFail, onProblem });
  useEffect(() => { callbacks.current = { onSelect, onGibsFail, onProblem }; });

  const sceneBounds: Bounds = preview ? preview.bounds : cornersBounds(rasterCorners(regions, study.utmZone));
  const maxBounds: Bounds = padBounds(sceneBounds, 4);
  const sceneKey = sceneBounds.join();

  // ---- create maps, static layers and camera sync (once per study)
  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !afterEl.current) return;
      try {
        lib.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        const style = (): StyleSpecification => ({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#0b0b0c" } }] });
        const make = (container: HTMLElement) => new lib.Map({
          container, style: style(), bounds: sceneBounds, fitBoundsOptions: { padding: 8 }, maxBounds, minZoom: 5, maxZoom: 17, cooperativeGestures: true,
          dragRotate: false, pitchWithRotate: false, attributionControl: false,
        }).addControl(new lib.AttributionControl({ compact: true, customAttribution: "Radar: NASA NISAR L2 GCOV (provisional) via ASF DAAC · exploratory" }))
          .addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        const after = make(afterEl.current);
        const before = preview && beforeEl.current ? make(beforeEl.current) : null;
        for (const [m, which] of [[before, "before"], [after, "after"]] as const) {
          m?.getCanvas().setAttribute("aria-label", `${study.label} ${which === "before" ? fmtDate(study.dates[0]) : fmtDate(study.dates[1])} radar map. Arrow keys pan; plus and minus zoom.`);
          m?.touchZoomRotate.disableRotation();
          if (m) {
            m.getCanvas().style.cursor = "grab";
            m.on("dragstart", () => { m.getCanvas().style.cursor = "grabbing"; });
            m.on("dragend", () => { m.getCanvas().style.cursor = "grab"; });
            m.on("mousemove", e => setPosition(`${e.lngLat.lat.toFixed(5)}° latitude / ${e.lngLat.lng.toFixed(5)}° longitude`));
            // easeTo(around) keeps the geographic point under the cursor fixed, like the proven zoom math.
            m.doubleClickZoom.disable();
            m.on("dblclick", e => { e.preventDefault(); m.easeTo({ zoom: Math.max(m.getMinZoom(), Math.min(m.getMaxZoom(), m.getZoom() + (e.originalEvent.shiftKey ? -1 : 1))), around: m.unproject(e.point), duration: reduceMotion() ? 0 : 250 }); });
          }
          m?.on("error", (e) => {
            const id = (e as { sourceId?: string }).sourceId;
            if (id === "gibs") callbacks.current.onGibsFail();
            else if (id) callbacks.current.onProblem("A radar image or map layer failed to load. Nothing is substituted; reload the page to retry.");
          });
        }
        // Keep both cameras identical. The lock prevents echo between the two move handlers.
        if (before) {
          let lock = false;
          const link = (src: MapLibreMap, dst: MapLibreMap) => () => {
            if (lock) return;
            lock = true;
            dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom() });
            lock = false;
          };
          const a = link(before, after), b = link(after, before);
          before.on("move", a); after.on("move", b);
        }
        const observers = [before, after].filter((m): m is MapLibreMap => !!m).map((m) => {
          const ro = new ResizeObserver(() => m.resize());
          ro.observe(m.getContainer());
          return ro;
        });
        cleanups.push(() => observers.forEach((o) => o.disconnect()));
        let remaining = before ? 2 : 1;
        const loaded = () => {
          if (cancelled || --remaining) return;
          const imageUrl = (dir: string, file: string) => dataUrl(`${dir}/${file}`);
          const regionData = { type: "FeatureCollection" as const, features: regions.regions.map((r) => ({ type: "Feature" as const, properties: { id: r.id }, geometry: { type: "Polygon" as const, coordinates: [r.ring] } })) };
          const markers = new Map<string, Marker[]>();
          for (const [m, which] of [[before, 0], [after, 1]] as const) {
            if (!m) continue;
            if (preview) {
              for (const pol of POLS) {
                const id = `sci-${pol}`;
                m.addSource(id, { type: "image", url: imageUrl(study.previewDir!, preview.acquisitions[which].images[pol].filename), coordinates: toQuad(preview.bounds) });
                m.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" }, paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 } });
              }
            }
            if (which === 1) {
              const corners = rasterCorners(regions, study.utmZone);
              for (const pol of POLS) {
                const id = `diff-${pol}`;
                m.addSource(id, { type: "image", url: imageUrl(study.regionsDir, `${pol}_difference_exploratory.png`), coordinates: corners });
                m.addLayer({ id, type: "raster", source: id, layout: { visibility: "none" }, paint: { "raster-resampling": "nearest", "raster-fade-duration": 0 } });
              }
            }
            m.addSource("regions", { type: "geojson", data: regionData });
            m.addLayer({ id: "region-fill", type: "fill", source: "regions", paint: { "fill-color": "#ffffff", "fill-opacity": 0 } });
            m.addLayer({ id: "region-line", type: "line", source: "regions", paint: { "line-color": "#c7c7cc", "line-width": 1.25, "line-opacity": 0.75 } });
            m.on("click", "region-fill", (e) => { const id = e.features?.[0]?.properties?.id; if (typeof id === "string") callbacks.current.onSelect(id); });
            m.on("mouseenter", "region-fill", e => { m.getCanvas().style.cursor = "pointer"; const r = regions.regions.find(r => r.id === e.features?.[0]?.properties?.id); m.getCanvas().title = r ? `Region ${r.id}: ${r.title} · ${regions.scientificStatus}` : regions.scientificStatus; });
            m.on("mouseleave", "region-fill", () => { m.getCanvas().style.cursor = "grab"; m.getCanvas().title = ""; });
            // Letter badges are a mouse convenience; keyboard and screen-reader users choose regions with the chips.
            markers.set(String(which), regions.regions.map((r) => {
              const el = document.createElement("button");
              el.type = "button"; el.textContent = r.id; el.className = styles.badge; el.dataset.region = r.id;
              el.tabIndex = 0; el.setAttribute("aria-label", `Select Region ${r.id}: ${r.title}`); el.title = `Region ${r.id}: ${r.title} · ${regions.scientificStatus}`;
              el.addEventListener("click", (ev) => { ev.stopPropagation(); callbacks.current.onSelect(r.id); });
              return new lib.Marker({ element: el }).setLngLat(centroid(r.ring)).addTo(m);
            }));
          }
          setHandles({ before, after, markers });
          onAfterMap(after);
        };
        after.once("load", loaded);
        before?.once("load", loaded);
        cleanups.push(() => { onAfterMap(null); before?.remove(); after.remove(); });
      } catch {
        callbacks.current.onProblem("The map could not start. A browser with WebGL support is required.");
      }
    }).catch(() => callbacks.current.onProblem("The map library could not load. Check your connection and reload."));
    return () => { cancelled = true; cleanups.forEach((c) => c()); setHandles(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one map pair per study; the component is keyed by study id
  }, [study.id, sceneKey]);

  const eachMap = useCallback((fn: (m: MapLibreMap, which: 0 | 1) => void) => {
    if (!handles) return;
    if (handles.before) fn(handles.before, 0);
    fn(handles.after, 1);
  }, [handles]);

  // ---- which raster is visible: HH/HV x single-date or difference
  useEffect(() => {
    eachMap((m, which) => {
      for (const p of POLS) {
        const show = (id: string, on: boolean) => {
          if (!m.getLayer(id)) return;
          m.setLayoutProperty(id, "visibility", "visible");
          m.setPaintProperty(id, "raster-opacity-transition", { duration: reduceMotion() ? 0 : 200 });
          m.setPaintProperty(id, "raster-opacity", on ? 1 : 0);
        };
        show(`sci-${p}`, mode !== "difference" && p === pol);
        show(`diff-${p}`, which === 1 && mode === "difference" && p === pol);
      }
    });
  }, [eachMap, pol, mode]);

  // ---- NASA GIBS browse mosaic: context only, below the measured rasters, added only after the pair was verified
  useEffect(() => {
    if (!handles || !gibsReady) return;
    eachMap((m, which) => {
      if (m.getSource("gibs")) return;
      const beforeId = [`sci-HH`, `diff-HH`].find((id) => m.getLayer(id));
      m.addSource("gibs", { type: "raster", tiles: [tileUrl(study.dates[which] as BrowseDate)], tileSize: 256, bounds: STUDY_BOUNDS, minzoom: 9, maxzoom: 9, attribution: ATTRIBUTION });
      m.addLayer({ id: "gibs", type: "raster", source: "gibs", paint: { "raster-opacity": 0.7, "raster-fade-duration": 0 } }, beforeId);
    });
  }, [handles, gibsReady, eachMap, study.dates]);
  useEffect(() => {
    eachMap((m) => { if (m.getLayer("gibs")) m.setLayoutProperty("gibs", "visibility", gibsVisible ? "visible" : "none"); });
  }, [eachMap, gibsVisible, gibsReady]);

  // ---- highlight the selected region on both maps
  useEffect(() => {
    if (!handles) return;
    const isSel = (a: unknown, b: unknown) => ["case", ["==", ["get", "id"], selectedId], a, b] as never;
    eachMap((m) => {
      m.setPaintProperty("region-line", "line-color", isSel("#ffffff", "#c7c7cc"));
      m.setPaintProperty("region-line", "line-width", isSel(3.5, 1.25));
      m.setPaintProperty("region-line", "line-opacity", isSel(1, 0.7));
      m.setPaintProperty("region-fill", "fill-opacity", 0);
    });
    for (const list of handles.markers.values()) for (const mk of list) {
      mk.getElement().dataset.selected = String(mk.getElement().dataset.region === selectedId);
    }
  }, [handles, eachMap, selectedId]);

  // ---- move the camera to the selected region (or back to the whole scene)
  const firstFit = useRef(true);
  useEffect(() => {
    if (!handles) return;
    const region = regions.regions.find((r) => r.id === selectedId);
    const bounds: Bounds = region ? padBounds(ringBounds(region.ring), 0.6) : sceneBounds;
    const animate = !firstFit.current && !reduceMotion();
    firstFit.current = false;
    handles.after.fitBounds(bounds as LngLatBoundsLike, { padding: 8, duration: animate ? 600 : 0, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneBounds is derived from sceneKey
  }, [handles, selectedId, resetSignal, regions, sceneKey]);

  // ---- regions remain selectable independently of the inspector
  useEffect(() => {
    eachMap(m => { for (const id of ["region-fill", "region-line"]) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", regionsVisible ? "visible" : "none"); });
    if (handles) for (const list of handles.markers.values()) for (const marker of list) marker.getElement().hidden = !regionsVisible;
  }, [handles, eachMap, regionsVisible]);

  // ---- horizontal divider, vertical motion, before above / after below
  const move = (clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (box && box.height) setSwipe(Math.min(100, Math.max(0, (clientY - box.top) / box.height * 100)));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); move(e.clientY); };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientY); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowUp") setSwipe(v => Math.max(0, v - step));
    else if (e.key === "ArrowDown") setSwipe(v => Math.min(100, v + step));
    else if (e.key === "Home") setSwipe(0); else if (e.key === "End") setSwipe(100);
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  const zoom = (delta: number) => { const m=handles?.after; if (m) m.easeTo({ zoom: Math.max(m.getMinZoom(), Math.min(m.getMaxZoom(), m.getZoom() + delta)), duration: reduceMotion() ? 0 : 250 }); };
  const reset = () => handles?.after.fitBounds(sceneBounds as LngLatBoundsLike, { padding: 8, duration: reduceMotion() ? 0 : 450 });
  const toggleFull = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await (frame.current?.closest('[data-workbench]') ?? frame.current)?.requestFullscreen(); }
    catch { callbacks.current.onProblem("Fullscreen is unavailable in this browser. The map remains usable in the page."); }
  };

  const twoUp = !!preview && mode !== "difference";
  const tag = (text: string, side: "l" | "r") => <span className={`${styles.tag} ${side === "l" ? styles.tagL : styles.tagR}`}>{text}</span>;
  return <div ref={frame} className={styles.mapFrame} data-mode={twoUp ? mode : "difference"}>
    {preview && <div ref={beforeEl} className={`${styles.pane} ${styles.paneBefore}`} data-testid="map-before" />}
    <div ref={afterEl} className={`${styles.pane} ${styles.paneAfter}`} style={mode === "swipe" && twoUp ? { clipPath: `inset(${swipe}% 0 0 0)` } : undefined} data-testid="map-after" />
    {twoUp && tag(`Before · ${fmtDate(study.dates[0])}`, "l")}
    {twoUp && tag(`After · ${fmtDate(study.dates[1])}`, "r")}
    {!twoUp && tag(`Exploratory difference · ${fmtDate(study.dates[1])} minus ${fmtDate(study.dates[0])}`, "l")}
    {mode === "swipe" && twoUp && <div className={styles.handle} style={{ top: `${swipe}%` }} role="slider" tabIndex={0} aria-label="Before and after divider"
      aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(swipe)} aria-valuetext={`Before above: ${Math.round(swipe)} percent. After below: ${100 - Math.round(swipe)} percent.`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onKeyDown={onKey}><span aria-hidden="true">↕</span></div>}
    <span className={styles.mapQa}>EXPLORATORY_NOT_CLEARED</span>
    <div className={styles.mapControls} role="group" aria-label="Map navigation">
      <button type="button" aria-label="Zoom in" disabled={!handles} onClick={() => zoom(1)}>+</button>
      <button type="button" aria-label="Zoom out" disabled={!handles} onClick={() => zoom(-1)}>−</button>
      <button type="button" aria-label="Reset map view" onClick={reset}>↺</button>
      <button ref={fullButton} type="button" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} aria-pressed={fullscreen} onClick={() => void toggleFull()}>{fullscreen ? "Close" : "⛶"}</button>
      <button type="button" aria-label="Show investigation regions" aria-pressed={regionsVisible} onClick={() => setRegionsVisible(v => !v)}>A/B/C</button>
    </div>
    <output className={styles.coordinates} aria-label="Cursor coordinates">{position}</output>
    <span className={styles.gestureHint}>Ctrl / ⌘ + scroll to zoom · Two fingers on touch</span>
    {!handles && <div className={styles.mapLoading} role="status">Loading radar map…</div>}
  </div>;
}
