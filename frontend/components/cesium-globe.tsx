"use client";

import { useEffect, useRef, useState } from "react";
import type * as CesiumNS from "cesium";
import type { Place } from "@/lib/places";
import { FLIGHT_CEILING, FLIGHT_SECONDS, FOCUS_HEIGHT, HERO_VIEW, type CameraTarget } from "@/lib/globe-journey";
import { prefersReducedMotion } from "@/lib/prefs";
import styles from "./globe-journey.module.css";

type Cesium = typeof CesiumNS;
declare global { interface Window { Cesium?: Cesium; CESIUM_BASE_URL?: string } }

const baseUrl = () => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cesium/`;
/** NASA GIBS Blue Marble: a sharper, public-domain base map. Natural Earth II stays underneath as the fallback. */
const BLUE_MARBLE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";
/** Sentinel-2 cloudless mosaic, about 10 m per pixel. Free for non-commercial use with attribution. */
const SENTINEL_CLOUDLESS = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
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
 * The one globe on the home page, rendered with CesiumJS (no Cesium ion). The camera flies once to each
 * stop as the visitor scrolls to it: stop 0 is the whole Earth, then each place in turn.
 */
export function CesiumGlobe({ places, activeIndex, onPick, onUnavailable }: {
  places: readonly Place[]; activeIndex: number; onPick: (id: string) => void; onUnavailable: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<CesiumNS.Viewer | null>(null);
  const cb = useRef({ onPick, onUnavailable });
  const quality = useRef<(hi: boolean) => void>(() => {});
  const placed = useRef(false);
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
          // Quality: render at the screen's real pixel density (the default is capped for speed) and smooth edges.
          useBrowserRecommendedResolution: false, msaaSamples: 4,
        }));
        // Crisper imagery on modern displays, without forcing huge framebuffers on phones.
        const compactScreen = window.matchMedia("(max-width: 899px)").matches;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, compactScreen ? 1.5 : 2);
        v.resolutionScale = pixelRatio;
        v.scene.postProcessStages.fxaa.enabled = true;
        const scene = v.scene;
        scene.backgroundColor = C.Color.BLACK;
        scene.globe.baseColor = C.Color.fromCssColorString("#16406f");
        scene.globe.enableLighting = false; scene.globe.showGroundAtmosphere = true;
        // High-detail textures and smoother oblique image sampling when parked at a location.
        scene.globe.maximumScreenSpaceError = compactScreen ? 1.8 : 1.15;
        scene.globe.tileCacheSize = compactScreen ? 120 : 220;
        scene.globe.preloadAncestors = true;
        scene.globe.atmosphereLightIntensity = 14; scene.globe.atmosphereBrightnessShift = 0.05;
        scene.fog.enabled = true;
        scene.fog.density = 0.00012;
        scene.fog.minimumBrightness = 0.08;
        const sky = (f: string) => `${baseUrl()}Assets/Textures/SkyBox/tycho2t3_80_${f}.jpg`;
        scene.skyBox = new C.SkyBox({ sources: { positiveX: sky("px"), negativeX: sky("mx"), positiveY: sky("py"), negativeY: sky("my"), positiveZ: sky("pz"), negativeZ: sky("mz") } });
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.show = true;
          scene.skyAtmosphere.atmosphereLightIntensity = 14;
        }
        if (scene.sun) scene.sun.show = false;
        if (scene.moon) scene.moon.show = false;
        // Natural-color Earth bundled with CesiumJS, awaited so the globe never flashes empty.
        const imagery = await C.TileMapServiceImageryProvider.fromUrl(`${baseUrl()}Assets/Textures/NaturalEarthII`);
        if (cancelled) { v.destroy(); return; }
        v.imageryLayers.addImageryProvider(imagery);
        // Higher-resolution layers stacked over the bundled map. Each is dropped on its own if its host is unreachable, so the
        // globe always falls back to the layer beneath it. Only tile requests are made; nothing about the visitor is sent.
        const addHd = (url: string, maximumLevel: number, credit: string) => {
          try {
            const hd = new C.UrlTemplateImageryProvider({ url, tilingScheme: new C.WebMercatorTilingScheme(), maximumLevel, credit });
            const layer = v.imageryLayers.addImageryProvider(hd);
            let failures = 0;
            hd.errorEvent.addEventListener(() => { if (++failures > 8 && !v.isDestroyed()) { v.imageryLayers.remove(layer, true); v.scene.requestRender(); } });
          } catch { /* optional */ }
        };
        addHd(BLUE_MARBLE, 8, "NASA GIBS · Blue Marble");
        addHd(SENTINEL_CLOUDLESS, 13, "Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020)");
        scene.globe.preloadSiblings = false;
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
            point: { pixelSize: 11, color: C.Color.fromCssColorString(GOLD), outlineColor: C.Color.WHITE.withAlpha(0.9), outlineWidth: 2,
              scaleByDistance: new C.NearFarScalar(100_000, 1.2, 25_000_000, 0.7),
              disableDepthTestDistance: Number.POSITIVE_INFINITY },
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
        // The camera flies once per stop (a timed, eased flight), so the GPU only works for those couple of seconds.
        // The globe renders on demand: a lighter tier is used during the flight, and full quality returns when it lands.
        let hq = true;
        quality.current = (hi: boolean) => {
          if (hi === hq || v.isDestroyed()) return;
          hq = hi;
          v.resolutionScale = hi ? pixelRatio : Math.min(pixelRatio, 1);
          scene.msaaSamples = hi ? (compactScreen ? 2 : 4) : 1;
          scene.globe.maximumScreenSpaceError = hi ? (compactScreen ? 1.8 : 1.15) : 3.2;
          scene.requestRender();
        };
        v.camera.setView({ destination: C.Cartesian3.fromDegrees(HERO_VIEW.lon, HERO_VIEW.lat, HERO_VIEW.height), orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
        scene.requestRender();
        setViewer(v);
        const prevCleanup = () => { for (const type of ["wheel", "touchstart", "touchmove", "touchend"]) host.removeEventListener(type, shield, { capture: true }); };
        (created as unknown as { __cleanup?: () => void }).__cleanup = prevCleanup;
      } catch { cb.current.onUnavailable(); }
    }).catch(() => cb.current.onUnavailable());
    return () => {
      cancelled = true; handler?.destroy();
      (created as unknown as { __cleanup?: () => void } | undefined)?.__cleanup?.();
      if (created && !created.isDestroyed()) created.destroy();
    };
  }, [places]);

  // One eased flight to each stop. Reduced motion jumps straight there.
  useEffect(() => {
    const C = window.Cesium;
    if (!viewer || !C || viewer.isDestroyed()) return;
    const t: CameraTarget = activeIndex === 0 ? HERO_VIEW : { lon: places[activeIndex - 1].lon, lat: places[activeIndex - 1].lat, height: FOCUS_HEIGHT };
    const destination = C.Cartesian3.fromDegrees(t.lon, t.lat, t.height), orientation = { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 };
    viewer.camera.cancelFlight();
    if (!placed.current || prefersReducedMotion()) { placed.current = true; viewer.camera.setView({ destination, orientation }); viewer.scene.requestRender(); return; }
    quality.current(false);
    viewer.camera.flyTo({ destination, orientation, duration: FLIGHT_SECONDS, maximumHeight: FLIGHT_CEILING, easingFunction: C.EasingFunction.CUBIC_IN_OUT,
      complete: () => quality.current(true), cancel: () => quality.current(true) });
  }, [viewer, activeIndex, places]);

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
