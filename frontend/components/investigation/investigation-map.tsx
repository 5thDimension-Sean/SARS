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
  const frame = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onGibsFail, onProblem });
  useEffect(() => { callbacks.current = { onSelect, onGibsFail, onProblem }; });

  const sceneBounds: Bounds = preview ? preview.bounds : cornersBounds(rasterCorners(regions, study.utmZone));
  const maxBounds: Bounds = study.gibsContext ? STUDY_BOUNDS : padBounds(sceneBounds, 1.5);
  const sceneKey = sceneBounds.join();

  // ---- create maps, static layers and camera sync (once per study)
  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    void import("maplibre-gl").then((lib) => {
      if (cancelled || !afterEl.current) return;
      try {
        lib.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        const style = (): StyleSpecification => ({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#17262b" } }] });
        const make = (container: HTMLElement) => new lib.Map({
          container, style: style(), bounds: sceneBounds, fitBoundsOptions: { padding: 24 }, maxBounds, minZoom: study.gibsContext ? 9 : 8, maxZoom: 17,
          dragRotate: false, pitchWithRotate: false, attributionControl: false,
        }).addControl(new lib.AttributionControl({ compact: true, customAttribution: "Radar: NASA NISAR L2 GCOV (provisional) via ASF DAAC · exploratory" }))
          .addControl(new lib.NavigationControl({ showCompass: false }), "top-right")
          .addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        const after = make(afterEl.current);
        const before = preview && beforeEl.current ? make(beforeEl.current) : null;
        for (const [m, which] of [[before, "before"], [after, "after"]] as const) {
          m?.getCanvas().setAttribute("aria-label", `${study.label} ${which === "before" ? fmtDate(study.dates[0]) : fmtDate(study.dates[1])} radar map. Arrow keys pan; plus and minus zoom.`);
          m?.touchZoomRotate.disableRotation();
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
            m.addLayer({ id: "region-fill", type: "fill", source: "regions", paint: { "fill-color": "#ffd166", "fill-opacity": 0.03 } });
            m.addLayer({ id: "region-line", type: "line", source: "regions", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.8 } });
            m.on("click", "region-fill", (e) => { const id = e.features?.[0]?.properties?.id; if (typeof id === "string") callbacks.current.onSelect(id); });
            m.on("mouseenter", "region-fill", () => { m.getCanvas().style.cursor = "pointer"; });
            m.on("mouseleave", "region-fill", () => { m.getCanvas().style.cursor = ""; });
            // Letter badges are a mouse convenience; keyboard and screen-reader users choose regions with the chips.
            markers.set(String(which), regions.regions.map((r) => {
              const el = document.createElement("button");
              el.type = "button"; el.textContent = r.id; el.className = styles.badge; el.dataset.region = r.id;
              el.tabIndex = -1; el.setAttribute("aria-hidden", "true");
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
        const show = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none"); };
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
      m.setPaintProperty("region-line", "line-color", isSel("#ffd166", "#ffffff"));
      m.setPaintProperty("region-line", "line-width", isSel(4, 1.5));
      m.setPaintProperty("region-line", "line-opacity", isSel(1, 0.7));
      m.setPaintProperty("region-fill", "fill-opacity", isSel(0.12, 0.02));
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
    handles.after.fitBounds(bounds as LngLatBoundsLike, { padding: 24, duration: animate ? 600 : 0, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneBounds is derived from sceneKey
  }, [handles, selectedId, resetSignal, regions, sceneKey]);

  // ---- swipe handle
  const move = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (box && box.width) setSwipe(Math.min(98, Math.max(2, (clientX - box.left) / box.width * 100)));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") setSwipe((v) => Math.max(2, v - step));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") setSwipe((v) => Math.min(98, v + step));
    else if (e.key === "Home") setSwipe(2); else if (e.key === "End") setSwipe(98);
    else return;
    e.preventDefault();
  };

  const twoUp = !!preview && mode !== "difference";
  const tag = (text: string, side: "l" | "r") => <span className={`${styles.tag} ${side === "l" ? styles.tagL : styles.tagR}`}>{text}</span>;
  return <div ref={frame} className={styles.mapFrame} data-mode={twoUp ? mode : "difference"}>
    {preview && <div ref={beforeEl} className={`${styles.pane} ${styles.paneBefore}`} data-testid="map-before" />}
    <div ref={afterEl} className={`${styles.pane} ${styles.paneAfter}`} style={mode === "swipe" && twoUp ? { clipPath: `inset(0 0 0 ${swipe}%)` } : undefined} data-testid="map-after" />
    {twoUp && tag(`Before · ${fmtDate(study.dates[0])}`, "l")}
    {twoUp && tag(`After · ${fmtDate(study.dates[1])}`, "r")}
    {!twoUp && tag(`Exploratory difference · ${fmtDate(study.dates[1])} minus ${fmtDate(study.dates[0])}`, "l")}
    {mode === "swipe" && twoUp && <div className={styles.handle} style={{ left: `${swipe}%` }} role="slider" tabIndex={0} aria-label="Before and after divider"
      aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(swipe)} aria-valuetext={`${Math.round(swipe)}% shows the before image`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onKeyDown={onKey}><span aria-hidden="true">⟷</span></div>}
    {!handles && <div className={styles.mapLoading} role="status">Loading radar map…</div>}
  </div>;
}
