"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STUDIES, fmtDate } from "@/lib/investigation";
import { prefersReducedMotion } from "@/lib/prefs";
import { CesiumGlobe, type StepId } from "./cesium-globe";
import styles from "./story-map.module.css";

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

/** Placeholder story map: a long scroll runway that flies a CesiumJS 3D globe between the three real locations. */
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
      <div className={styles.stage}>{flat ? <FlatMap active={active} onPick={go} /> : <CesiumGlobe active={active} onPick={go} onUnavailable={() => setFlat(true)} />}
        <p className={styles.credit}>3D globe: CesiumJS · Imagery: Natural Earth II (public domain)</p>
        <div className={styles.stops} role="group" aria-label="Jump to a place">{STUDIES.map((s) => <button key={s.id} type="button" aria-pressed={active === s.id} onClick={() => go(s.id)}>{s.short}</button>)}</div>
      </div>
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
