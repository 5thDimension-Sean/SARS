"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

const ROOT = "/data/rodanthe-processed/T162_F019_A";
const dates = ["September 17, 2026", "September 29, 2026"] as const;
const names = ["20260917", "20260929"] as const;
const description = "Fixed display ranges: HH −25 to 0 dB, HV −30 to −5 dB; difference −6 to +6 dB. Blue: reduced return on September 29. Red: increased return. White: little change. The temporal difference is September 29 minus September 17.";
export default function CoastalErosionPage() {
  const [polarization, setPolarization] = useState<"HH" | "HV">("HH");
  const [mode, setMode] = useState<"pair" | "difference">("pair");
  const [date, setDate] = useState<0 | 1>(0);
  const file = (i: number) => `${ROOT}/${names[i]}_${polarization}.png`;
  const diff = `${ROOT}/change_20260917_20260929${polarization === "HV" ? "_HV" : ""}.png`;
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <p className={styles.kicker}>NISAR SCIENTIFIC INVESTIGATION / NORTH CAROLINA</p>
      <h1>Rodanthe: the coast after the storm.</h1>
      <p className={styles.lede}>Two genuine NASA–ISRO NISAR L-band radar observations bracket the September 23–27, 2026 Outer Banks nor’easter. Explore provisional GCOV backscatter, not simulated satellite imagery.</p>
      <div className={styles.note}><strong>Scientific boundary:</strong> These are real, georeferenced radar intensity measurements and derived differences; they do not establish a measured shoreline retreat or erosion rate. Water level, wet sand, surface roughness and radar artifacts can all affect the signal. Product-level scientific QA and independent shoreline validation remain pending.</div>
      <div className={styles.toolbar}>
        <div role="group" aria-label="Radar polarization" className={styles.segment}>
          {(["HH", "HV"] as const).map(p => <button key={p} type="button" aria-pressed={polarization === p} onClick={() => setPolarization(p)}>{p} polarization</button>)}
        </div>
        <div role="group" aria-label="Comparison mode" className={styles.segment}>
          <button type="button" aria-pressed={mode === "pair"} onClick={() => setMode("pair")}>Before / after</button>
          <button type="button" aria-pressed={mode === "difference"} onClick={() => setMode("difference")}>Calculated dB difference</button>
        </div>
      </div>
      {mode === "pair" ?
        <div className={styles.pair}>{([0,1] as const).map(i =>
          <figure className={styles.figure} key={i}>
            <figcaption><span>{i === 0 ? "BEFORE THE STORM" : "AFTER THE STORM"}</span><strong>{dates[i]}</strong></figcaption>
            <div className={styles.image}><Image src={file(i)} alt={`${polarization} NISAR backscatter at Rodanthe, ${dates[i]}`} fill sizes="(max-width:800px) 100vw, 50vw" unoptimized /></div>
          </figure>)}</div> :
        <div className={styles.diff}>
          <div className={styles.toolbar}>
            <div role="group" aria-label="Selected acquisition" className={styles.segment}>
              {([0,1] as const).map(i => <button type="button" key={i} aria-pressed={date === i} onClick={() => setDate(i)}>Reference: {dates[i]}</button>)}
            </div>
          </div>
          <div className={styles.pair}>
            <figure className={styles.figure}><figcaption><span>REFERENCE / {polarization}</span><strong>{dates[date]}</strong></figcaption><div className={styles.image}><Image src={file(date)} alt={`${polarization} source acquisition on ${dates[date]}`} fill sizes="(max-width:800px) 100vw, 50vw" unoptimized /></div></figure>
            <figure className={styles.figure}><figcaption><span>SEPTEMBER 29 MINUS SEPTEMBER 17</span><strong>{polarization} backscatter change (dB)</strong></figcaption><div className={styles.image}><Image src={diff} alt={`${polarization} georeferenced change in decibels with red increases, blue decreases`} fill sizes="(max-width:800px) 100vw, 50vw" unoptimized /></div></figure>
          </div>
        </div>}
      <p className={styles.explain}>{description}</p>
      <section className={styles.details}>
        <div><h2>Actual data</h2><p>NASA NISAR Level-2 GCOV, provisional; same ascending track 162, frame 19, release P05023, product version 1.0.11. HH and HV polarization. The 10 m UTM analysis grid is 640 × 1,224 pixels and is common to both dates.</p><p><a href="/data/rodanthe-processed/manifest.json" target="_blank" rel="noreferrer">Processing manifest</a> · <a href="/data/rodanthe-processed/discovery.json" target="_blank" rel="noreferrer">ASF granule provenance</a> · <a href={`${ROOT}/change_20260917_20260929${polarization === "HV" ? "_HV" : ""}.tif`} download>Download {polarization} difference GeoTIFF</a></p></div>
        <div><h2>Independent evidence</h2><p>The US National Weather Service documented dangerous surf, ocean overwash and beach erosion on Hatteras Island September 23–27, 2026. The storm falls between the two satellite acquisitions, but this does not by itself prove which features in the radar map are erosion.</p><p><a href="https://www.weather.gov/mhx/SeptemberNoreaster2026" target="_blank" rel="noreferrer">NWS storm report</a> · <a href="https://www.usgs.gov/science/science-explorer/coasts/coastal-change" target="_blank" rel="noreferrer">USGS coastal change</a></p></div>
      </section>
      <p className={styles.footer}><Link href="/nisar-prototype">Back to other NISAR investigations</Link> · Exploratory case study only; not a validated erosion estimate</p>
    </div>
  </main>;
}
