"use client";

import Image from "next/image";
import { useState } from "react";
import { ProcessedEvidencePathway } from "./padma-evidence-pathway";
import styles from "./padma-erosion-story.module.css";

const NASA_STORY = "https://science.nasa.gov/earth/earth-observatory/world-of-change/padma-river/";
const IMAGES = [
  { date: "1988-01-02", year: "1988", label: "Landsat 5 · Thematic Mapper",
    src: "https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/woc/images/padma/padma_tm5_1988002.jpg?fit=clip&h=480&w=720" },
  { date: "2018-01-20", year: "2018", label: "Landsat 8 · Operational Land Imager",
    src: "https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/woc/images/padma/padma_oli_2018020.jpg?fit=clip&h=480&w=720" },
] as const;

export function PadmaErosionStory() {
  const [mode, setMode] = useState<"side" | "toggle">("side");
  const [current, setCurrent] = useState<0 | 1>(1);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const images = mode === "side" ? IMAGES : [IMAGES[current]];
  return <div className={styles.page}>
    <header className={styles.hero}>
      <h1>A river that redraws the land.</h1>
      <p className={styles.lead}>Two NASA Landsat views, 1988 and 2018, of a river that keeps moving.</p>
      <p className={styles.notice}><strong>Optical Landsat imagery, not NISAR.</strong> No radar pair processed here.</p>
      <a className={styles.primary} href="#look">Begin the investigation <span aria-hidden="true">↓</span></a>
    </header>
    <ProcessedEvidencePathway />
    <section className={styles.section} id="context" aria-labelledby="padma-context-title">
      <div className={styles.sectionHead}><h2 id="padma-context-title">What makes this river different?</h2>
        <p>Flowing water erodes one bank and builds new land elsewhere.</p></div>
      <div className={styles.reasoning}>
        <div><h3>What is happening here?</h3><p>In Bangladesh, the Padma’s channel changes shape over time. The Harirampur reach experienced notable historical bank loss, while shifting bars and bends also illustrate deposition.</p></div>
        <div><h3>Why does it matter?</h3><p>Communities use the river for farming and transport. A migrating channel can affect nearby land and infrastructure even when the overall river system is naturally changing.</p></div>
      </div>
    </section>
    <section className={styles.section} id="look" aria-labelledby="padma-compare-title">
      <div className={styles.sectionHead}><h2 id="padma-compare-title">Watch the river move.</h2>
        <p>Compare the bends near Harirampur and Char Janajat. Not every color change is erosion.</p></div>
      <div className={styles.controls}>
        <div className={styles.segment} role="group" aria-label="Image comparison layout">
          <button aria-pressed={mode === "side"} onClick={() => setMode("side")}>Side by side</button>
          <button aria-pressed={mode === "toggle"} onClick={() => setMode("toggle")}>Toggle dates</button>
        </div>
        {mode === "toggle" && <div className={styles.segment} role="group" aria-label="Satellite image date">
          {IMAGES.map((im, i) => <button key={im.year} aria-pressed={current === i} onClick={() => setCurrent(i as 0 | 1)}>{im.year}</button>)}
        </div>}
      </div>
      <div className={mode === "side" ? styles.pair : styles.single}>
        {images.map(im => <figure key={im.year} className={styles.figure}>
          <div className={styles.imageWrap}>{failed[im.year]
          ? <div className={styles.imageError} role="status"><p>NASA image could not be loaded.</p><a href={NASA_STORY} target="_blank" rel="noopener noreferrer">View original NASA imagery ↗</a></div>
          : <Image src={im.src} alt={`NASA Landsat view of Padma River channels near Harirampur and Char Janajat in ${im.year}`} width={720} height={480} unoptimized sizes="(max-width: 740px) 100vw, 50vw" onError={() => setFailed(previous => ({ ...previous, [im.year]: true }))} />}</div>
          <figcaption><strong>{im.year}</strong><span>{im.label}</span><small>NASA Earth Observatory · Acquired {im.date}</small></figcaption>
        </figure>)}
      </div>
      <p className={styles.caption}>Source: <a href={NASA_STORY} target="_blank" rel="noopener noreferrer">NASA Earth Observatory — World of Change: Padma River ↗</a>. Illustrative, not a pixel-level land-loss measurement.</p>
    </section>
    <section className={styles.section} id="compare" aria-labelledby="padma-evidence-title">
      <div className={styles.sectionHead}><h2 id="padma-evidence-title">Erosion and deposition together.</h2></div>
      <div className={styles.cards}>
        <div className={styles.card}><span>1988 → 2018</span><strong>30 years</strong><p>NASA&apos;s Landsat time series documents a changing channel shape, braiding, and riverbank position.</p></div>
        <div className={styles.card}><span>Published historical context</span><strong>66,000+ ha</strong><p>Land lost along the Padma since 1967, as reported by NASA&apos;s 2018 article. This is not a TANGO calculation or a 1988–2018 difference.</p></div>
        <div className={styles.card}><span>Measurement status</span><strong>Not computed</strong><p>No NISAR backscatter analysis, georeferenced shoreline-rate calculation, or confidence estimate exists in this TANGO study.</p></div>
      </div>
      <details className={styles.card} style={{ marginTop: 28 }}><summary>More detail: observations, uncertainty and SAR validation</summary>
      <div className={styles.tableScroll}><table className={styles.dataTable}>
        <caption>Acquisition and analysis availability — Padma River</caption>
        <thead><tr><th scope="col">Evidence / measure</th><th scope="col">Earlier</th><th scope="col">Later</th><th scope="col">Interpretation</th></tr></thead>
        <tbody>
          <tr><th scope="row">Acquisition</th><td>January 2, 1988</td><td>January 20, 2018</td><td>Published NASA Landsat comparison</td></tr>
          <tr><th scope="row">Instrument</th><td>Landsat 5 TM</td><td>Landsat 8 OLI</td><td>Optical / infrared multispectral imagery</td></tr>
          <tr><th scope="row">Observed geometry</th><td>River channel, banks and bars</td><td>River channel, banks and bars</td><td>Source-documented bank erosion and deposition</td></tr>
          <tr><th scope="row">NISAR HH / HV (dB)</th><td>Not available</td><td>Not available</td><td>Cannot calculate backscatter change from these images</td></tr>
          <tr><th scope="row">Paired-pixel erosion rate</th><td colSpan={2}>Not processed</td><td>Requires aligned bankline measurements and uncertainty checks</td></tr>
        </tbody></table></div>
      <p className={styles.caption}>The 66,000+ hectare figure covers loss since 1967, not these two scenes.</p>
      <div className={styles.reasoning}>
        <div><h3>What did the satellite observe?</h3><p>Across NASA&apos;s 1988–2018 image sequence, the channel bends, islands, and banks occupy different positions. The published series uses Landsat imagery acquired during the dry season.</p></div>
        <div><h3>Why is this evidence of erosion?</h3><p>NASA documents historical bank loss, especially around Harirampur, alongside deposition in lower-energy parts of the river. Channel migration can remove land on one bank while depositing sediment elsewhere.</p></div>
        <div><h3>What remains uncertain?</h3><p>Two displayed images alone cannot determine a local erosion rate, identify every cause, or measure net land change. River stage, season, georeferencing, and independently mapped banklines matter.</p></div>
        <div><h3>How could we validate with SAR?</h3><p>Find same-track NISAR GCOV acquisitions for this footprint, check metadata and QA, register grids, mask water and invalid pixels, and compare derived shoreline positions against independent optical and field evidence. Do not equate backscatter with erosion by itself.</p></div>
      </div>
      </details>
    </section>
    <section className={styles.section} id="verify" aria-labelledby="padma-source-title">
      <div className={styles.sectionHead}><h2 id="padma-source-title">What is established.</h2></div>
      <div className={styles.tableScroll}><table className={styles.dataTable}>
        <caption>Scientific evidence checklist — not a confidence score</caption>
        <thead><tr><th scope="col">Check</th><th scope="col">Status</th><th scope="col">Evidence / limitation</th></tr></thead>
        <tbody>
          <tr><th scope="row">Published satellite observations</th><td>Available</td><td>NASA Landsat imagery from 1988 and 2018</td></tr>
          <tr><th scope="row">Independent published erosion history</th><td>Available</td><td>NASA Earth Observatory summarizes historical studies; no new TANGO measurement</td></tr>
          <tr><th scope="row">Aligned numerical water / land masks</th><td>Not processed</td><td>Displayed RGB imagery is not a georeferenced land-loss calculation</td></tr>
          <tr><th scope="row">Same-track NISAR HH / HV pair</th><td>Not verified</td><td>No validated source-grid comparison for Padma</td></tr>
          <tr><th scope="row">Quantitative erosion detection</th><td>Not established</td><td>Requires matched geometry, independent validation and uncertainty analysis</td></tr>
        </tbody></table></div>
      <details className={styles.card} style={{ marginTop: 20 }}><summary>More detail: sources and limitations</summary>
      <ul className={styles.sources}>
        <li><strong>NASA Earth Observatory:</strong> <a href={NASA_STORY} target="_blank" rel="noopener noreferrer">World of Change — Padma River (1988–2018)</a></li>
        <li><strong>Full imagery sequence:</strong> <a href={NASA_STORY + "all-images/"} target="_blank" rel="noopener noreferrer">All 14 Landsat observations (1988–2018)</a></li>
        <li><strong>NASA research context:</strong> <a href="https://science.nasa.gov/earth/earth-observatory/the-most-erosive-area-on-the-padma-92529/" target="_blank" rel="noopener noreferrer">The Most Erosive Area on the Padma</a></li>
        <li><strong>Instruments:</strong> Landsat 5 TM and Landsat 8 OLI; these images contain optical/infrared bands, not SAR radar returns</li>
        <li><strong>Scientific status:</strong> Source-published erosion history; no TANGO-derived erosion rate or NISAR validation for this place</li>
      </ul>
      </details>
    </section>
  </div>;
}
