"use client";

import Image from "next/image";
import { useState } from "react";
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
  const images = mode === "side" ? IMAGES : [IMAGES[current]];
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>TANGO / EROSION FIELD STUDY / BANGLADESH</p>
      <h1>A river that redraws the land.</h1>
      <p className={styles.lead}>The Padma River changes course as banks erode and sediment builds new bars. Compare two real NASA Landsat observations separated by 30 years to see how channels and islands have shifted.</p>
      <p className={styles.notice}><strong>Independent optical evidence · not NISAR:</strong> These are NASA Landsat multispectral images, not NISAR SAR observations. TANGO has not processed a NISAR pair for this location.</p>
    </header>
    <section className={styles.section} aria-labelledby="padma-compare-title">
      <div className={styles.sectionHead}><span className={styles.eyebrow}>01 / VISUAL EVIDENCE</span><h2 id="padma-compare-title">Watch the river move.</h2>
        <p>The dark river channels, pale sediment bars, and surrounding land show a different pattern in 1988 and 2018. Look at the bends near Harirampur and Char Janajat. Not every difference in color represents erosion.</p></div>
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
          <div className={styles.imageWrap}><Image src={im.src} alt={`NASA Landsat view of Padma River channels near Harirampur and Char Janajat in ${im.year}`} width={720} height={480} unoptimized sizes="(max-width: 740px) 100vw, 50vw" /></div>
          <figcaption><strong>{im.year}</strong><span>{im.label}</span><small>NASA Earth Observatory · Acquired {im.date}</small></figcaption>
        </figure>)}
      </div>
      <p className={styles.caption}>Source: <a href={NASA_STORY} target="_blank" rel="noopener noreferrer">NASA Earth Observatory — World of Change: Padma River ↗</a>. The two images illustrate a longer history of channel migration, erosion, and deposition; they are not an aligned pixel-level measurement of land loss.</p>
    </section>
    <section className={styles.section} aria-labelledby="padma-evidence-title">
      <div className={styles.sectionHead}><span className={styles.eyebrow}>02 / WHAT THE EVIDENCE SAYS</span><h2 id="padma-evidence-title">Erosion and deposition together.</h2></div>
      <div className={styles.cards}>
        <div className={styles.card}><span>1988 → 2018</span><strong>30 years</strong><p>NASA&apos;s Landsat time series documents a changing channel shape, braiding, and riverbank position.</p></div>
        <div className={styles.card}><span>Published historical context</span><strong>66,000+ ha</strong><p>Land lost along the Padma since 1967, as reported by NASA&apos;s 2018 article. This is not a TANGO calculation or a 1988–2018 difference.</p></div>
        <div className={styles.card}><span>Measurement status</span><strong>Not computed</strong><p>No NISAR backscatter analysis, georeferenced shoreline-rate calculation, or confidence estimate exists in this TANGO study.</p></div>
      </div>
      <div className={styles.reasoning}>
        <div><h3>What did the satellite observe?</h3><p>Across NASA&apos;s 1988–2018 image sequence, the channel bends, islands, and banks occupy different positions. The published series uses Landsat imagery acquired during the dry season.</p></div>
        <div><h3>Why is this evidence of erosion?</h3><p>NASA documents historical bank loss, especially around Harirampur, alongside deposition in lower-energy parts of the river. Channel migration can remove land on one bank while depositing sediment elsewhere.</p></div>
        <div><h3>What remains uncertain?</h3><p>Two displayed images alone cannot determine a local erosion rate, identify every cause, or measure net land change. River stage, season, georeferencing, and independently mapped banklines matter.</p></div>
        <div><h3>How could we validate with SAR?</h3><p>Find same-track NISAR GCOV acquisitions for this footprint, check metadata and QA, register grids, mask water and invalid pixels, and compare derived shoreline positions against independent optical and field evidence. Do not equate backscatter with erosion by itself.</p></div>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="padma-source-title">
      <div className={styles.sectionHead}><span className={styles.eyebrow}>03 / PROVENANCE & LIMITATIONS</span><h2 id="padma-source-title">Know which instrument produced the evidence.</h2></div>
      <ul className={styles.sources}>
        <li><strong>NASA Earth Observatory:</strong> <a href={NASA_STORY} target="_blank" rel="noopener noreferrer">World of Change — Padma River (1988–2018)</a></li>
        <li><strong>NASA research context:</strong> <a href="https://science.nasa.gov/earth/earth-observatory/the-most-erosive-area-on-the-padma-92529/" target="_blank" rel="noopener noreferrer">The Most Erosive Area on the Padma</a></li>
        <li><strong>Instruments:</strong> Landsat 5 TM and Landsat 8 OLI; these images contain optical/infrared bands, not SAR radar returns</li>
        <li><strong>Scientific status:</strong> Source-published erosion history; no TANGO-derived erosion rate or NISAR validation for this place</li>
      </ul>
    </section>
  </div>;
}
