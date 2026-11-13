"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { ProcessedOverlayPanel } from "./processed-overlay-panel";
import { ATTRIBUTION, DATES, GRANULES, STUDY_BOUNDS, tileUrl, verifyBrowsePair, type BrowseDate } from "@/lib/nisar-browse";
import { EvergladesPreviewLayer } from "./everglades-preview-layer";
import styles from "./nisar-prototype.module.css";

export function NisarPrototype() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [previewMap, setPreviewMap] = useState<MapLibreMap | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [date, setDate] = useState<BrowseDate>(DATES[1]);
  const [verified, setVerified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("Checking both NASA imagery dates…");
  const [error, setError] = useState("");
  const [processedDisplay, setProcessedDisplay] = useState("");
  const [readyMap, setReadyMap] = useState<MapLibreMap | null>(null);
  const [position, setPosition] = useState("25.5000° N, 80.6500° W");

  useEffect(() => {
    const controller = new AbortController();
    let instance: MapLibreMap | undefined;
    let resize: ResizeObserver | undefined;
    let failed = false;
    const fail = (text: string) => {
      if (controller.signal.aborted) return;
      failed = true;
      setLoaded(false);
      setError(text);
    };
    const timeout = window.setTimeout(() => fail("Map loading timed out. Check your connection and retry."), 30000);

    void verifyBrowsePair(controller.signal).then((available) => {
      if (controller.signal.aborted) return;
      setVerified(available);
      setMessage(available
        ? "Both dates have overlapping browse coverage on the same geographic tile grid."
        : "Insufficient shared imagery coverage. Before/after comparison is unavailable.");
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("Could not verify both imagery dates. Comparison is unavailable; retry when connected.");
    });

    void import("maplibre-gl").then((lib) => {
      if (controller.signal.aborted || !container.current) return;
      try {
        // MapLibre 6 needs an explicit bundled worker URL before creating a map.
        lib.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        instance = new lib.Map({
          container: container.current,
          center: [-80.65, 25.5], zoom: 10,
          maxBounds: STUDY_BOUNDS, minZoom: 9, maxZoom: 13,
          dragRotate: false, pitchWithRotate: false,
          attributionControl: { compact: false },
          style: {
            version: 8,
            sources: Object.fromEntries(DATES.map((d) => [d, {
              type: "raster", tiles: [tileUrl(d)], tileSize: 256,
              // Keep this prototype on the exact resolution verified by the coverage probe.
              bounds: STUDY_BOUNDS, minzoom: 9, maxzoom: 9, attribution: ATTRIBUTION,
            }])),
            layers: [
              { id: "background", type: "background", paint: { "background-color": "#17262b" } },
              ...DATES.map((d) => ({ id: d, type: "raster" as const, source: d, paint: { "raster-fade-duration": 0, "raster-opacity": d === DATES[1] ? 1 : 0, "raster-opacity-transition": { duration: 0 } } })),
            ],
          },
        });
        map.current = instance;
        instance.on("load", () => { if (!controller.signal.aborted) setPreviewMap(instance ?? null); });
        instance.on("load", () => setReadyMap(instance!));
        instance.touchZoomRotate.disableRotation();
        instance.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        instance.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        instance.getCanvas().setAttribute("aria-label", "Everglades geographic map. Use arrow keys to pan and plus or minus to zoom.");
        instance.on("error", () => fail("NASA tiles or the map renderer failed to load. Comparison is disabled. Retry to reconnect."));
        instance.on("idle", () => {
          if (!controller.signal.aborted && !failed) {
            window.clearTimeout(timeout);
            setLoaded(true);
          }
        });
        instance.on("movestart", () => setLoaded(false));
        instance.on("moveend", () => {
          const center = instance!.getCenter();
          setPosition(`${center.lat.toFixed(4)}° N, ${Math.abs(center.lng).toFixed(4)}° W`);
        });
        resize = new ResizeObserver(() => instance?.resize());
        resize.observe(container.current);
      } catch {
        fail("The geographic map could not start. A browser with WebGL support is required.");
      }
    }).catch(() => fail("The map library could not load. Check your connection and retry."));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      resize?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, [attempt]);

  const canCompare = verified && loaded && !error && !processedDisplay;
  const selectDate = (next: BrowseDate) => {
    if (!canCompare || !map.current) return;
    // One camera and one tile matrix: switching dates cannot alter geographic alignment.
    DATES.forEach((d) => map.current!.setPaintProperty(d, "raster-opacity", next === d ? 1 : 0));
    setDate(next);
  };
  const retry = () => {
    setReadyMap(null); setProcessedDisplay("");
    setVerified(false); setLoaded(false); setError(""); setDate(DATES[1]);
    setMessage("Checking both NASA imagery dates…"); setAttempt((value) => value + 1);
  };

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>SAR-Waltz · Observation explorer</p><h1>Everglades radar imagery</h1></div>
      <Link href="/">Return to educational demo</Link>
    </header>
    <p><strong>Real NASA imagery · Provisional GCOV · False-color browse visualization</strong></p>
    <div className={styles.toolbar} role="group" aria-label="Compare imagery dates">
      <Button variant="outline" disabled={!canCompare} aria-pressed={date === DATES[0]} onClick={() => selectDate(DATES[0])}>Before · Sep 30, 2026</Button>
      <Button variant="outline" disabled={!canCompare} aria-pressed={date === DATES[1]} onClick={() => selectDate(DATES[1])}>After · Oct 12, 2026</Button>
      {(error || !verified) && <Button variant="outline" onClick={retry}>Retry imagery</Button>}
    </div>
    <p className={styles.status} role="status">{error || `${message}${!loaded ? " Loading map…" : ""}`}</p>
    <section className={styles.mapFrame} aria-label="NASA NISAR geographic viewport">
      <div ref={container} className={styles.map} />
      <div className={styles.date}>{processedDisplay || <>NASA GIBS mosaic · <strong>{date} UTC</strong></>}</div>
    </section>
    <EvergladesPreviewLayer map={previewMap} />
    <p className={styles.caption}>Map center: {position}. Drag or use arrow keys to pan; scroll, pinch, or use +/− to zoom. Navigation is limited to the verified South Florida study tile. This prototype uses fixed zoom-9 browse tiles; zooming enlarges those pixels.</p>
    <p>Switch dates to compare the same view. This false-color radar browse mosaic is not an optical photograph. It provides no pixel-level granule lineage or quantitative backscatter measurements. Colors do not establish flooding, vegetation loss, or ground displacement.</p>
    <div className={styles.products}><ProcessedOverlayPanel map={readyMap} onDisplay={setProcessedDisplay} /></div>
    <details className={styles.details}>
      <summary>Sources, acquisition dates, and limitations</summary>
      <p>NASA GIBS daily GCOV mosaics may combine products. The source acquisitions below intersect the Everglades verification point (25.5° N, 80.8° W); they are not pixel-level lineage for the whole mosaic.</p>
      <ul>{DATES.map((d, i) => <li key={d}><a href={`https://cmr.earthdata.nasa.gov/search/concepts/${GRANULES[i]}.html`}>{d} · {GRANULES[i]}</a> · descending track 170, frame 076; acquisition {i === 0 ? "00:05:12–00:05:47.999" : "00:05:13–00:05:47.999"} UTC.</li>)}</ul>
      <p>Collection: NISAR_L2_GCOV_PROVISIONAL_V1. <a href="https://doi.org/10.5067/NIL2GCOV-P1">Dataset DOI</a>. Source records checked November 6, 2026. The displayed RGB mosaic combines available polarization modes; there is no individual HH/HV selector or quantitative analysis here. Browser transparency checks concern display coverage, not science quality masks.</p>
      <p>We acknowledge the use of imagery from the NASA Global Imagery Browse Services (GIBS), part of NASA&apos;s Earth Science Data and Information System (ESDIS).</p>
      <p><a href="https://hyp3-docs.asf.alaska.edu/nisar-docs/worldview/">ASF imagery guide</a> · <a href="https://nisar-docs.asf.alaska.edu/provisional-known-issues/">Provisional-data limitations</a> · <a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS</a></p>
    </details>
  </main>;
}
