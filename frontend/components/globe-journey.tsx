"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLACES } from "@/lib/places";
import { fmtDate } from "@/lib/investigation";
import { progressFor } from "@/lib/globe-journey";
import { prefersReducedMotion } from "@/lib/prefs";
import { CesiumGlobe } from "./cesium-globe";
import styles from "./globe-journey.module.css";

const VH_PER_STOP = 80;
const STOPS = PLACES.length + 1;

/**
 * The home opening: one pinned globe, many places. Everything here is scroll-linked rather than timed, so the camera
 * and the copy move exactly as fast as the visitor scrolls, and scrolling back up reverses them.
 */
export function GlobeJourney() {
  const runway = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [flat, setFlat] = useState(false);
  const places = useMemo(() => PLACES, []);

  // Scrolling only chooses the current stop. Each change triggers one timed flight and one text transition.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = runway.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const n = Math.round(progressFor(r.top + 52, r.height, window.innerHeight, STOPS));
      setActive((a) => (a === n ? a : n));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);

  const goTo = useCallback((index: number) => {
    const el = runway.current;
    if (!el) return;
    const travel = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY - 52 + (index / (STOPS - 1)) * travel;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);
  const pick = useCallback((id: string) => { const i = PLACES.findIndex((p) => p.id === id); if (i >= 0) goTo(i + 1); }, [goTo]);

  return <section ref={runway} className={styles.runway} style={{ height: `${(STOPS - 1) * VH_PER_STOP + 100}vh` }} aria-label="Places we have radar for">
    <div className={styles.stage}>
      {flat ? <p className={styles.fallback} role="status">The 3D globe needs WebGL, which this browser does not provide. Keep scrolling to read about each place.</p>
        : <div className={styles.globeWrap}><CesiumGlobe places={places} activeIndex={active} onPick={pick} onUnavailable={() => setFlat(true)} /></div>}
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.copy}>
        <article className={styles.panel} data-active={active === 0} inert={active !== 0} aria-label="Introduction">
          <h1 className={styles.display}>Our Golden Record</h1>
          <p className={styles.scrollCue}><span aria-hidden="true" />Scroll to start</p>
        </article>
        {places.map((p, i) => <article key={p.id} className={styles.panel} data-active={active === i + 1} inert={active !== i + 1} aria-label={p.label}>
          <p className={styles.eyebrow}>Stop {String(i + 1).padStart(2, "0")} / {String(places.length).padStart(2, "0")}</p>
          <h2 className={styles.title}>{p.label}</h2>
          <p className={styles.dates}><time dateTime={p.dates[0]}>{fmtDate(p.dates[0])}</time><i aria-hidden="true">→</i><time dateTime={p.dates[1]}>{fmtDate(p.dates[1])}</time></p>
          <p className={styles.lead}>{p.blurb} Radar differences alone do not name a cause.</p>
          <Link className={styles.cta} href={p.href}>Open this investigation <span aria-hidden="true">↗</span></Link>
        </article>)}
      </div>
      <ol className={styles.timeline} aria-label="Journey timeline">
        <li><button type="button" className={styles.dot} aria-label="Start from orbit" aria-current={active === 0 ? "step" : undefined} onClick={() => goTo(0)}><span>Orbit</span></button></li>
        {places.map((p, i) => <li key={p.id}><button type="button" className={styles.dot} aria-label={`Go to ${p.label}`} aria-current={active === i + 1 ? "step" : undefined} onClick={() => goTo(i + 1)}><span>{p.short}</span></button></li>)}
      </ol>
      <p className={styles.credit}>3D globe: CesiumJS · Imagery: Natural Earth II, NASA GIBS Blue Marble, Sentinel-2 cloudless © EOX (contains modified Copernicus Sentinel data 2020)</p>
    </div>
  </section>;
}
