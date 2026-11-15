"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  EVIDENCE_LABELS, RESEARCH_STUDIES, researchIdFromHash, researchMediaUrl, researchSummary,
  type ResearchImage, type ResearchStudy,
} from "@/lib/research-studies";
import styles from "./research-preview.module.css";
import { ResearchLocationEvidenceStory } from "./location-evidence-story";

const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const snapshot = () => researchIdFromHash(window.location.hash);
const serverSnapshot = () => "hubbard";
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function SourceImage({ media }: { media: ResearchImage }) {
  const [loaded, setLoaded] = useState(!media.defer);
  const [failed, setFailed] = useState(false);
  return <figure className={styles.figure}>
    <div className={styles.imageFrame}>
      {!loaded ? <div className={styles.empty}>
        <span className={styles.small}>Publisher imagery</span>
        <p>{media.label}</p>
        <button type="button" onClick={() => setLoaded(true)}>Load publisher image</button>
      </div> : failed ? <div className={styles.empty} role="status">
        <p>The publisher image could not be loaded.</p>
        <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">Open the original image ↗</a>
      </div> : <Image src={researchMediaUrl(media.src)} alt={media.label + (media.date ? " · " + fmt(media.date) : "")}
        fill unoptimized sizes="(max-width: 800px) 100vw, 50vw" className={styles.image}
        referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </div>
    <figcaption><strong>{media.date ? <time dateTime={media.date}>{fmt(media.date)}</time> : media.label}</strong>
      {media.date && <span>{media.label}</span>}
      <small>{media.credit}</small>
      <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">Publisher source ↗</a>
    </figcaption>
  </figure>;
}

function Gallery({ study }: { study: ResearchStudy }) {
  const [pol, setPol] = useState<"HH" | "HV">("HH");
  const [view, setView] = useState<"pair" | "toggle">("pair");
  const [dateIndex, setDateIndex] = useState(0);
  const [video, setVideo] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const images = study.gallery === "polarization-pair" ? study.media.filter(m => m.polarization === pol) : study.media;
  const paired = study.gallery === "pair" || study.gallery === "polarization-pair";
  if (study.gallery === "pending") return <section className={styles.pending} aria-label="NISAR availability">
    <span className={styles.small}>NISAR observations pending</span>
    <h3>Find the acquisitions first.</h3>
    <p>The event is documented, but a comparable NISAR before-and-after pair has not been verified. No substitute radar image or measured result is shown.</p>
    <p>{study.nextStep}</p>
  </section>;
  return <section aria-label="Research imagery">
    {paired && <div className={styles.controls}>
      {study.gallery === "polarization-pair" && <div className={styles.segment} role="group" aria-label="Browse polarization">
        {(["HH", "HV"] as const).map(p => <button type="button" key={p} aria-pressed={pol === p} onClick={() => setPol(p)}>{p}</button>)}
      </div>}
      <div className={styles.segment} role="group" aria-label="Comparison layout">
        <button type="button" aria-pressed={view === "pair"} onClick={() => setView("pair")}>Side by side</button>
        <button type="button" aria-pressed={view === "toggle"} onClick={() => setView("toggle")}>Toggle dates</button>
      </div>
      {view === "toggle" && <div className={styles.segment} role="group" aria-label="Observation date">
        {study.observationDates.map((d, i) => <button type="button" key={d} aria-pressed={dateIndex === i} onClick={() => setDateIndex(i)}>{fmt(d)}</button>)}
      </div>}
    </div>}
    <div className={paired && view === "pair" ? styles.imagePair : styles.imageSingle}>
      {(paired && view === "toggle" ? [images[dateIndex]] : images).map(m => <SourceImage key={m.src} media={m} />)}
    </div>
    {study.video && <div className={styles.videoBlock}>
      {!video ? <button type="button" onClick={() => setVideo(true)}>Load NASA lava-flow time-lapse ↗</button>
        : videoFailed ? <p role="status">The video could not be loaded. <a href={study.video.sourceUrl} target="_blank" rel="noopener noreferrer">Open NASA&apos;s video ↗</a></p>
        : <video controls preload="metadata" aria-label={study.video.label} onError={() => setVideoFailed(true)}>
          <source src={researchMediaUrl(study.video.src)} type="video/mp4" />Your browser cannot play this video.
        </video>}
      <p>{study.video.note} Credit: {study.video.credit}.</p>
    </div>}
    <p className={styles.caption}>Visual review only. Publisher composites and browse PNGs are not numerical radar grids; their displayed colors cannot be subtracted to calculate a dB difference.</p>
  </section>;
}

function downloadSummary(study: ResearchStudy) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(researchSummary(study), null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = study.id + "-research-summary.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StudyDetail({ study }: { study: ResearchStudy }) {
  return <article className={styles.detail} aria-labelledby="research-study-title">
    <div className={styles.detailHeading}>
      <div><p className={styles.eyebrow}>{study.region} / {study.country}</p><h2 id="research-study-title" tabIndex={-1}>{study.title}</h2></div>
      <span className={styles.badge} data-kind={study.evidence}>{EVIDENCE_LABELS[study.evidence]}</span>
    </div>
    <p className={styles.period}>{study.period}</p>
    <p className={styles.story}>{study.story}</p>
    {study.id === "etna" && <p><Link href="/etna-investigation">View TANGO’s newly processed, genuine NISAR HH/HV histograms, difference maps and three measured regions →</Link></p>}
    <ResearchLocationEvidenceStory study={study} />
    <Gallery study={study} />
    <div className={styles.evidenceGrid}>
      <section className={styles.qa} aria-labelledby="research-qa-title">
        <span className={styles.small}>Scientific review</span><h3 id="research-qa-title">Blocked · exploratory</h3>
        <p className={styles.code}>{study.scientificClearance}</p>
        <ul>{study.limitations.map(l => <li key={l}>{l}</li>)}</ul>
        <p>Published imagery is evidence of what the publisher observed. It does not clear our own product validation.</p>
      </section>
      <section className={styles.sources} aria-labelledby="research-sources-title">
        <span className={styles.small}>Provenance</span><h3 id="research-sources-title">Read the source.</h3>
        <ul>{study.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></li>)}</ul>
        <h4>Next research step</h4><p>{study.nextStep}</p>
        <button type="button" onClick={() => downloadSummary(study)}>Download research summary ↓</button>
      </section>
    </div>
    {study.archive && <details className={styles.archive}><summary>Archived October 2026 Hubbard pair</summary><p>{study.archive.note}</p><p>{study.archive.dates.map(fmt).join(" · ")}</p></details>}
  </article>;
}

export function ResearchPreview() {
  const id = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [region, setRegion] = useState("All regions");
  const study = RESEARCH_STUDIES.find(s => s.id === id)!;
  const regions = [...new Set(RESEARCH_STUDIES.map(s => s.region))];
  // A back/forward navigation or direct hash may select a study outside the
  // current filter. Keep that active study visible in the location controls.
  const visibleRegion = region !== "All regions" && study.region !== region ? "All regions" : region;
  const studies = visibleRegion === "All regions" ? RESEARCH_STUDIES : RESEARCH_STUDIES.filter(s => s.region === visibleRegion);
  const pick = (next: string) => { window.location.hash = next; };
  const filter = (next: string) => {
    setRegion(next);
    if (next !== "All regions" && study.region !== next) pick(RESEARCH_STUDIES.find(s => s.region === next)!.id);
  };
  return <main className={styles.page}>
    <a className="skip-link" href="#research-study-title">Skip to research study</a>
    <div className={styles.wrap}>
      <header className={styles.header}>
        <p className={styles.eyebrow}><span className={styles.dot} /> Internal research preview · unpublished</p>
        <h1>A wider world.<br /><span>Evidence comes first.</span></h1>
        <p>Nine research stops, from lava fields to fractured ice. Explore published NISAR observations alongside clearly marked candidates for the next studies.</p>
        <div className={styles.headerLinks}><Link href="/nisar-prototype">Open existing investigations ↗</Link><span>No scientific clearance or numerical change claims</span></div>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <label className={styles.filterLabel} htmlFor="research-region">Explore a region</label>
          <select id="research-region" value={visibleRegion} onChange={e => filter(e.target.value)}>
            <option>All regions</option>{regions.map(r => <option key={r}>{r}</option>)}
          </select>
          <nav aria-label="Research locations"><ul>{studies.map(s => <li key={s.id}>
            <button type="button" aria-pressed={id === s.id} onClick={() => pick(s.id)}>
              <span className={styles.locationTop}>{s.country}<span aria-hidden="true">↗</span></span>
              <strong>{s.title}</strong><span className={styles.locationTheme}>{s.theme}</span>
              <span className={styles.locationState} data-kind={s.evidence}>{EVIDENCE_LABELS[s.evidence]}</span>
            </button>
          </li>)}</ul></nav>
          <p className={styles.sidebarNote}>Research assets remain separate from the existing investigations. Unverified candidates do not contain invented radar imagery or measurements.</p>
        </aside>
        <StudyDetail key={study.id} study={study} />
      </div>
      <footer className={styles.footer}>NASA / ISRO source imagery is credited per scene. This research preview has not been deployed. All nine studies remain exploratory and not cleared.</footer>
    </div>
  </main>;
}
