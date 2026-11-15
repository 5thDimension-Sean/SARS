"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type * as CesiumNS from "cesium";
import type { Place } from "@/lib/places";
import { FOCUS_HEIGHT, HERO_VIEW, cameraAt, type CameraTarget } from "@/lib/globe-journey";
import { prefersReducedMotion } from "@/lib/prefs";
import styles from "./globe-journey.module.css";

type Cesium = typeof CesiumNS;
declare global { interface Window { Cesium?: Cesium; CESIUM_BASE_URL?: string } }

const baseUrl = () => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cesium/`;
/** NASA GIBS Blue Marble: a sharper, public-domain base map. Natural Earth II stays underneath as the fallback. */
const BLUE_MARBLE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
const GOLD = "#f6c667";

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
 * The one globe on the home page, rendered with CesiumJS (no Cesium ion). Its camera is driven by `progressRef`, the
 * visitor's scroll position, so it travels at the visitor's own pace: stop 0 is the whole Earth, then each place in turn.
 */
export function CesiumGlobe({ places, progressRef, activeIndex, onPick, onUnavailable }: {
  places: readonly Place[]; progressRef: MutableRefObject<number>; activeIndex: number; onPick: (id: string) => void; onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<CesiumNS.Viewer | null>(null);
  const cb = useRef({ onPick, onUnavailable });
  useEffect(() => { cb.current = { onPick, onUnavailable }; });

  useEffect(() => {
    let cancelled = false, created: CesiumNS.Viewer | undefined, handler: CesiumNS.ScreenSpaceEventHandler | undefined, raf = 0;
    const stops: CameraTarget[] = [HERO_VIEW, ...places.map((p) => ({ lon: p.lon, lat: p.lat, height: FOCUS_HEIGHT }))];
    void loadCesium().then(async (C) => {
      if (cancelled || !box.current) return;
      try {
        const v = (created = new C.Viewer(box.current, {
          baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
          animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true, shouldAnimate: false,
          skyBox: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
          // Quality: render at the screen's real pixel density (the default is capped for speed) and smooth edges.
          useBrowserRecommendedResolution: false, msaaSamples: 4,
        }));
        v.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
        v.scene.postProcessStages.fxaa.enabled = true;
        const scene = v.scene;
        scene.backgroundColor = C.Color.BLACK;
        scene.globe.baseColor = C.Color.fromCssColorString("#16406f");
        scene.globe.enableLighting = false; scene.globe.showGroundAtmosphere = true;
        scene.globe.maximumScreenSpaceError = 1; scene.globe.tileCacheSize = 300;
        scene.globe.atmosphereLightIntensity = 14; scene.globe.atmosphereBrightnessShift = 0.05;
        const sky = (f: string) => `${baseUrl()}Assets/Textures/SkyBox/tycho2t3_80_${f}.jpg`;
        scene.skyBox = new C.SkyBox({ sources: { positiveX: sky("px"), negativeX: sky("mx"), positiveY: sky("py"), negativeY: sky("my"), positiveZ: sky("pz"), negativeZ: sky("mz") } });
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
        if (scene.sun) scene.sun.show = false;
        if (scene.moon) scene.moon.show = false;
        // Natural-color Earth bundled with CesiumJS, awaited so the globe never flashes empty.
        const imagery = await C.TileMapServiceImageryProvider.fromUrl(`${baseUrl()}Assets/Textures/NaturalEarthII`);
        if (cancelled) { v.destroy(); return; }
        v.imageryLayers.addImageryProvider(imagery);
        // Sharper layer on top. If NASA GIBS cannot be reached the layer is dropped and the bundled imagery shows through.
        try {
          const hd = new C.UrlTemplateImageryProvider({ url: BLUE_MARBLE, tilingScheme: new C.WebMercatorTilingScheme(), maximumLevel: 8, credit: "NASA GIBS · Blue Marble" });
          const layer = v.imageryLayers.addImageryProvider(hd);
          let failures = 0;
          hd.errorEvent.addEventListener(() => { if (++failures > 6 && !v.isDestroyed()) { v.imageryLayers.remove(layer, true); v.scene.requestRender(); } });
        } catch { /* optional */ }
        // Scrolling belongs to the page: stop Cesium from seeing wheel and touch input, and turn its own camera controls off.
        const host = box.current;
        const shield = (e: Event) => e.stopPropagation();
        for (const type of ["wheel", "touchstart", "touchmove", "touchend"]) host.addEventListener(type, shield, { capture: true, passive: true });
        const ctl = scene.screenSpaceCameraController;
        ctl.enableZoom = false; ctl.enableTilt = false; ctl.enableLook = false; ctl.enableTranslate = false; ctl.enableRotate = false;
        const font = `700 15px ${getComputedStyle(document.body).fontFamily}`;
        for (const p of places) {
          v.entities.add({
            id: p.id, position: C.Cartesian3.fromDegrees(p.lon, p.lat),
            point: { pixelSize: 11, color: C.Color.fromCssColorString(GOLD), outlineColor: C.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: p.short.toUpperCase(), font, fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK.withAlpha(0.85), outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE,
              horizontalOrigin: C.HorizontalOrigin.LEFT, verticalOrigin: C.VerticalOrigin.CENTER, pixelOffset: new C.Cartesian2(16, 0), disableDepthTestDistance: Number.POSITIVE_INFINITY },
            rectangle: p.bounds ? { coordinates: C.Rectangle.fromDegrees(...(p.bounds as [number, number, number, number])), fill: false, outline: true, outlineColor: C.Color.fromCssColorString(GOLD), height: 0 } : undefined,
          });
        }
        handler = new C.ScreenSpaceEventHandler(v.canvas);
        handler.setInputAction((m: { position: CesiumNS.Cartesian2 }) => { const hit = scene.pick(m.position) as { id?: { id?: string } } | undefined; const id = hit?.id?.id; if (id) cb.current.onPick(id); }, C.ScreenSpaceEventType.LEFT_CLICK);
        // Camera readout for debugging and tests only; throttled to whole kilometres.
        scene.postRender.addEventListener(() => {
          if (!box.current) return;
          const c = C.Cartographic.fromCartesian(v.camera.positionWC);
          box.current.dataset.view = `${C.Math.toDegrees(c.longitude).toFixed(1)},${C.Math.toDegrees(c.latitude).toFixed(1)},${(c.height / 1000).toFixed(0)}`;
        });
        // Scroll-linked camera. Reduced motion snaps to the nearest stop instead of travelling between them.
        let lastP = Number.NaN, lastSpin = 0, spin = 0;
        const aim = (t: CameraTarget) => v.camera.setView({ destination: C.Cartesian3.fromDegrees(t.lon, t.lat, t.height), orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
        const visible = { v: true };
        const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { visible.v = e.isIntersecting; }) : null;
        io?.observe(host);
        const frame = (t: number) => {
          raf = requestAnimationFrame(frame);
          if (v.isDestroyed() || !visible.v || document.hidden) return;
          const dt = Math.min((t - lastSpin) / 1000, 0.1); lastSpin = t;
          const reduced = prefersReducedMotion();
          const raw = progressRef.current;
          const p = reduced ? Math.round(raw) : raw;
          // A very slow drift while parked on the opening view keeps the Earth alive without taking control from scrolling.
          const idle = p < 0.02 && !reduced;
          if (idle) spin += dt * 2.2; else if (spin !== 0 && p >= 0.02) spin = 0;
          if (p === lastP && !idle) return;
          lastP = p;
          const c = cameraAt(stops, p);
          aim({ ...c, lon: c.lon - spin });
          scene.requestRender();
        };
        raf = requestAnimationFrame(frame);
        v.camera.setView({ destination: C.Cartesian3.fromDegrees(HERO_VIEW.lon, HERO_VIEW.lat, HERO_VIEW.height), orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
        scene.requestRender();
        setViewer(v);
        const prevCleanup = () => { io?.disconnect(); for (const type of ["wheel", "touchstart", "touchmove", "touchend"]) host.removeEventListener(type, shield, { capture: true }); };
        (created as unknown as { __cleanup?: () => void }).__cleanup = prevCleanup;
      } catch { cb.current.onUnavailable(); }
    }).catch(() => cb.current.onUnavailable());
    return () => {
      cancelled = true; cancelAnimationFrame(raf); handler?.destroy();
      (created as unknown as { __cleanup?: () => void } | undefined)?.__cleanup?.();
      if (created && !created.isDestroyed()) created.destroy();
    };
  }, [places, progressRef]);

  // Labels: only the current stop is named, so the orbit view stays uncluttered.
  useEffect(() => {
    const C = window.Cesium;
    if (!viewer || !C || viewer.isDestroyed()) return;
    places.forEach((p, i) => {
      const e = viewer.entities.getById(p.id), on = i + 1 === activeIndex;
      if (e?.point) e.point.pixelSize = new C.ConstantProperty(on ? 17 : 11);
      if (e?.label) { e.label.show = new C.ConstantProperty(on); e.label.scale = new C.ConstantProperty(on ? 1.25 : 1); }
    });
    viewer.scene.requestRender();
  }, [viewer, activeIndex, places]);

  return <div ref={box} className={styles.globe} data-ready={!!viewer}>{!viewer && <span className={styles.loading} role="status">Loading globe…</span>}</div>;
}
