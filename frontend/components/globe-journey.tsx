"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLACES } from "@/lib/places";
import { fmtDate } from "@/lib/investigation";
import { progressFor, textState } from "@/lib/globe-journey";
import { prefersReducedMotion } from "@/lib/prefs";
import { CesiumGlobe } from "./cesium-globe";
import styles from "./globe-journey.module.css";

const VH_PER_STOP = 95;
const STOPS = PLACES.length + 1;

/**
 * The home opening: one pinned globe, many places. Everything here is scroll-linked rather than timed, so the camera
 * and the copy move exactly as fast as the visitor scrolls, and scrolling back up reverses them.
 */
export function GlobeJourney() {
  const runway = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [flat, setFlat] = useState(false);
  const places = useMemo(() => PLACES, []);

  const paint = useCallback((p: number) => {
    panels.current.forEach((el, i) => {
      if (!el) return;
      const { opacity, x } = textState(i, p);
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = prefersReducedMotion() ? "none" : `translateX(${x.toFixed(1)}px)`;
      const live = opacity > 0.55;
      el.style.visibility = opacity < 0.01 ? "hidden" : "visible";
      el.dataset.live = String(live);
      el.toggleAttribute("inert", !live);
    });
  }, []);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = runway.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = progressFor(r.top + 52, r.height, window.innerHeight, STOPS);
      progress.current = p;
      paint(p);
      setActive((a) => { const n = Math.round(p); return n === a ? a : n; });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [paint]);

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
        : <div className={styles.globeWrap}><CesiumGlobe places={places} progressRef={progress} activeIndex={active} onPick={pick} onUnavailable={() => setFlat(true)} /></div>}
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.copy}>
        <article ref={(el) => { panels.current[0] = el; }} className={styles.panel} style={{ opacity: 1 }} aria-label="Introduction">
          <p className={styles.eyebrow}>NASA Space Apps · 2026</p>
          <h1 className={styles.display}>Our Golden Record, written in radar.</h1>
          <p className={styles.scrollCue}><span aria-hidden="true" />Scroll to start</p>
        </article>
        {places.map((p, i) => <article key={p.id} ref={(el) => { panels.current[i + 1] = el; }} className={styles.panel} style={{ opacity: 0, visibility: "hidden" }} aria-label={p.label}>
          <p className={styles.eyebrow}>Stop {String(i + 1).padStart(2, "0")} / {String(places.length).padStart(2, "0")}</p>
          <h2 className={styles.title}>{p.label}</h2>
          <p className={styles.dates}><time dateTime={p.dates[0]}>{fmtDate(p.dates[0])}</time><i aria-hidden="true">→</i><time dateTime={p.dates[1]}>{fmtDate(p.dates[1])}</time></p>
          <p className={styles.lead}>{p.blurb} Radar differences alone do not name a cause.</p>
          <ul className={styles.chips} aria-label="Included">{p.tags.map((t) => <li key={t}>{t}</li>)}</ul>
          <Link className={styles.cta} href={p.href}>Open this investigation <span aria-hidden="true">↗</span></Link>
        </article>)}
      </div>
      <ol className={styles.timeline} aria-label="Journey timeline">
        <li><button type="button" className={styles.dot} aria-label="Start from orbit" aria-current={active === 0 ? "step" : undefined} onClick={() => goTo(0)}><span>Orbit</span></button></li>
        {places.map((p, i) => <li key={p.id}><button type="button" className={styles.dot} aria-label={`Go to ${p.label}`} aria-current={active === i + 1 ? "step" : undefined} onClick={() => goTo(i + 1)}><span>{p.short}</span></button></li>)}
      </ol>
      <p className={styles.credit}>3D globe: CesiumJS · Imagery: NASA GIBS Blue Marble and Natural Earth II (public domain)</p>
    </div>
  </section>;
}
