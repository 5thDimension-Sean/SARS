"use client";

import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import everglades from "@/public/data/everglades-preview/preview-manifest.json";
import louisiana from "@/public/data/louisiana-preview/preview-manifest.json";
import california from "@/public/data/california-preview/preview-manifest.json";
import { STUDIES, type Bounds, type StudyConfig } from "@/lib/investigation";
import { FLIGHT_CEILING, OVERVIEW, centerOf, focusTarget } from "@/lib/globe-camera";
import { prefersReducedMotion } from "@/lib/prefs";
import styles from "./story-map.module.css";

type Cesium = typeof CesiumNS;
declare global { interface Window { Cesium?: Cesium; CESIUM_BASE_URL?: string } }

const BOUNDS: Record<StudyConfig["id"], Bounds> = { everglades: everglades.bounds as Bounds, louisiana: louisiana.bounds as Bounds, california: california.bounds as Bounds };
export type StepId = "overview" | StudyConfig["id"];
const baseUrl = () => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cesium/`;

let loading: Promise<Cesium> | null = null;
/** Loads CesiumJS's own prebuilt script from this site (never a CDN). Cached for the page's lifetime. */
function loadCesium(): Promise<Cesium> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  return (loading ??= new Promise<Cesium>((resolve, reject) => {
    window.CESIUM_BASE_URL = baseUrl();
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = `${baseUrl()}Widgets/widgets.css`; document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = `${baseUrl()}Cesium.js`; script.async = true;
    script.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("CesiumJS did not initialise")));
    script.onerror = () => { loading = null; reject(new Error("CesiumJS could not be loaded")); };
    document.head.appendChild(script);
  }));
}

/**
 * The story globe, rendered with CesiumJS. No Cesium ion: the viewer is created without a default base layer or
 * widgets, and uses the Natural Earth II color imagery that ships with CesiumJS (public domain). The camera flies
 * up and over to each scene footprint as the story scrolls.
 */
export function CesiumGlobe({ active, onPick, onUnavailable }: { active: StepId; onPick: (id: StepId) => void; onUnavailable: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<CesiumNS.Viewer | null>(null);
  const cb = useRef({ onPick, onUnavailable });
  useEffect(() => { cb.current = { onPick, onUnavailable }; });

  useEffect(() => {
    let cancelled = false, created: CesiumNS.Viewer | undefined, handler: CesiumNS.ScreenSpaceEventHandler | undefined;
    void loadCesium().then(async (C) => {
      if (cancelled || !box.current) return;
      try {
        const v = (created = new C.Viewer(box.current, {
          baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
          animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true, shouldAnimate: false,
          skyBox: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
        }));
        const scene = v.scene;
        scene.backgroundColor = C.Color.BLACK;
        scene.globe.baseColor = C.Color.fromCssColorString("#1d4f86");
        scene.globe.enableLighting = false; scene.globe.showGroundAtmosphere = true;
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
        if (scene.sun) scene.sun.show = false;
        if (scene.moon) scene.moon.show = false;
        // Natural-color Earth bundled with CesiumJS (Natural Earth II). Awaited so the globe never flashes empty.
        const imagery = await C.TileMapServiceImageryProvider.fromUrl(`${baseUrl()}Assets/Textures/NaturalEarthII`);
        if (cancelled) { v.destroy(); return; }
        v.imageryLayers.addImageryProvider(imagery);
        // The wheel scrolls the page and touch drags scroll it too: only mouse drag rotates the globe.
        // CesiumJS calls preventDefault on wheel and touch input even when zoom is off, which would stop the page scrolling
        // over the globe. Stopping those events at the container (capture phase) keeps Cesium from seeing them.
        const coarse = window.matchMedia("(pointer: coarse)").matches;
        const host = box.current;
        const shield = (e: Event) => e.stopPropagation();
        host.addEventListener("wheel", shield, { capture: true, passive: true });
        if (coarse) for (const type of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup"]) host.addEventListener(type, shield, { capture: true, passive: true });
        const ctl = scene.screenSpaceCameraController;
        ctl.enableZoom = false; ctl.enableTilt = false; ctl.enableLook = false; ctl.enableTranslate = false;
        ctl.enableRotate = !coarse;
        const font = `500 14px ${getComputedStyle(document.body).fontFamily}`;
        for (const s of STUDIES) {
          const b = BOUNDS[s.id], [lon, lat] = centerOf(b);
          v.entities.add({
            id: s.id, position: C.Cartesian3.fromDegrees(lon, lat),
            point: { pixelSize: 9, color: C.Color.fromCssColorString("#f5f5f7"), outlineColor: C.Color.BLACK.withAlpha(0.45), outlineWidth: 2 },
            label: { text: s.short, font, fillColor: C.Color.fromCssColorString("#f5f5f7"), outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE,
              horizontalOrigin: C.HorizontalOrigin.LEFT, verticalOrigin: C.VerticalOrigin.CENTER, pixelOffset: new C.Cartesian2(14, 0) },
            rectangle: { coordinates: C.Rectangle.fromDegrees(b[0], b[1], b[2], b[3]), fill: false, outline: true, outlineColor: C.Color.WHITE, height: 0 },
          });
        }
        // Keyboard and touch users pick a stop with the buttons beside the globe; mouse users can also click a marker.
        handler = new C.ScreenSpaceEventHandler(v.canvas);
        if (!coarse) handler.setInputAction((m: { position: CesiumNS.Cartesian2 }) => { const hit = scene.pick(m.position) as { id?: { id?: string } } | undefined; const id = hit?.id?.id; if (id) cb.current.onPick(id as StepId); }, C.ScreenSpaceEventType.LEFT_CLICK);
        // Camera readout for debugging and tests only; cheap, throttled to whole kilometres.
        scene.postRender.addEventListener(() => {
          if (!box.current) return;
          const p = C.Cartographic.fromCartesian(v.camera.positionWC);
          box.current.dataset.view = `${C.Math.toDegrees(p.longitude).toFixed(1)},${C.Math.toDegrees(p.latitude).toFixed(1)},${(p.height / 1000).toFixed(0)}`;
        });
        v.camera.setView({ destination: C.Cartesian3.fromDegrees(OVERVIEW.lon, OVERVIEW.lat, OVERVIEW.height), orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
        v.scene.requestRender();
        setViewer(v);
      } catch { cb.current.onUnavailable(); }
    }).catch(() => cb.current.onUnavailable());
    return () => { cancelled = true; handler?.destroy(); if (created && !created.isDestroyed()) created.destroy(); };
  }, []);

  // The camera follows the story: up and over to each stop (flyTo arcs on its own), or an instant move when motion is reduced.
  useEffect(() => {
    const C = window.Cesium;
    if (!viewer || !C || viewer.isDestroyed()) return;
    const t = active === "overview" ? OVERVIEW : focusTarget(BOUNDS[active]);
    const destination = C.Cartesian3.fromDegrees(t.lon, t.lat, t.height);
    const orientation = { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 };
    viewer.camera.cancelFlight();
    if (prefersReducedMotion()) { viewer.camera.setView({ destination, orientation }); viewer.scene.requestRender(); }
    else viewer.camera.flyTo({ destination, orientation, duration: active === "overview" ? 2.6 : 3.8, maximumHeight: FLIGHT_CEILING });
    for (const s of STUDIES) {
      const e = viewer.entities.getById(s.id);
      if (e?.point) e.point.pixelSize = new C.ConstantProperty(s.id === active ? 14 : 9);
      if (e?.label) e.label.show = new C.ConstantProperty(active === "overview" || s.id === active);
    }
    viewer.scene.requestRender();
  }, [viewer, active]);

  return <div ref={box} className={styles.globe} data-ready={!!viewer}>{!viewer && <span className={styles.loading} role="status">Loading globe…</span>}</div>;
}
