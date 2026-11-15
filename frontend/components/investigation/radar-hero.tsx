"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import everglades from "@/public/data/everglades-preview/preview-manifest.json";
import louisiana from "@/public/data/louisiana-preview/preview-manifest.json";
import california from "@/public/data/california-preview/preview-manifest.json";
import hawaii from "@/public/data/hawaii-preview/preview-manifest.json";
import iowa from "@/public/data/iowa-preview/preview-manifest.json";
import palm from "@/public/data/palm-preview/preview-manifest.json";
const MANIFESTS = { everglades, louisiana, california, hawaii, iowa, palm } as const;
import { dataUrl, fmtDate, parsePreview, type Pol, type StudyConfig } from "@/lib/investigation";
import { prefersReducedMotion } from "@/lib/prefs";
import styles from "./investigation.module.css";

const subscribeConnection = (notify: () => void) => {
  window.addEventListener("online", notify); window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};
export function ConnectionStatus() {
  const online = useSyncExternalStore(subscribeConnection, () => navigator.onLine, () => true);
  return online ? null : <p role="status" className={styles.notice}>You are offline. New evidence requests may fail; no substitute data is shown.</p>;
}

export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = node.current;
    if (!el || !('IntersectionObserver' in window) || prefersReducedMotion()) return;
    el.dataset.reveal = "waiting";
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { el.dataset.reveal = "visible"; observer.disconnect(); } }, { threshold: .08 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={node} className={`${styles.reveal} ${className}`}>{children}</div>;
}

export function RadarHero({ study, pol, educational = false }: { study: StudyConfig; pol: Pol; educational?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const later = useRef<HTMLImageElement>(null);
  let preview;
  try { preview = parsePreview(MANIFESTS[study.id], study); } catch { preview = null; }
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const update = () => {
      if (!root.current || !later.current) return;
      const rect = root.current.getBoundingClientRect();
      later.current.style.opacity = prefersReducedMotion() ? "0" : String(Math.max(0, Math.min(1, -rect.top / (rect.height * .65))));
    };
    const scroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update(); window.addEventListener('scroll', scroll, { passive: true }); mq.addEventListener('change', update);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', scroll); mq.removeEventListener('change', update); };
  }, [study.id]);
  return <section ref={root} className={styles.hero} aria-labelledby="radar-hero-title">
    <div className={styles.heroInner}>
      <div className={styles.heroCopy}>
        <h1 id="radar-hero-title">A different way<br />to see Earth.</h1>
        <p className={styles.heroLead}>NISAR records the microwave energy returned by Earth’s surface. Two dates invite a closer look. Exploratory data; official identification QA failed and scientific clearance remains unresolved.</p>
        {educational ? <Link className={styles.primary} href="/nisar-prototype">Begin the investigation <span aria-hidden="true">↗</span></Link> : <a className={styles.primary} href="#step-look">Begin the investigation <span aria-hidden="true">↓</span></a>}
      </div>
      {preview ? <figure key={study.id} className={`${styles.heroFigure} ${styles.enter}`}>
        <div className={styles.heroRaster}>
          {/* eslint-disable-next-line @next/next/no-img-element -- untouched measured raster, static export */}
          <img src={dataUrl(`${study.previewDir}/${preview.acquisitions[0].images[pol].filename}`)} alt={`${study.label}, ${fmtDate(study.dates[0])}, ${pol} radar backscatter; not an optical photograph.`} width="404" height="444" fetchPriority="high" />
          {/* eslint-disable-next-line @next/next/no-img-element -- scroll changes opacity only, never measured pixels */}
          <img ref={later} className={styles.heroLater} src={dataUrl(`${study.previewDir}/${preview.acquisitions[1].images[pol].filename}`)} alt={`${study.label}, ${fmtDate(study.dates[1])}, ${pol} radar backscatter.`} width="404" height="444" loading="lazy" />
        </div>
        <figcaption><span>{study.label} · Same area, two dates</span><span>{fmtDate(study.dates[0])} / {fmtDate(study.dates[1])} · {pol} · {preview.acquisitions[0].images[pol].displayRangeDb.join(" to ")} dB</span><span>NASA NISAR L2 GCOV via ASF DAAC · Single-date previews, no cause established</span></figcaption>
      </figure> : <p className={styles.notice}>The published preview did not validate. No substitute imagery is shown.</p>}
    </div>
  </section>;
}
