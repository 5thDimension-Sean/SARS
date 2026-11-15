/* eslint-disable @next/next/no-img-element -- static measured rasters are shown exactly as published (nearest-neighbour, no optimisation) */
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { blendedChangeUrl } from "@/lib/change-filter";
import { dataUrl, fmtDate, type Pol } from "@/lib/investigation";
import { prefersReducedMotion } from "@/lib/prefs";
import hawaii from "@/public/data/hawaii-review/hawaii-summary.json";
import iowa from "@/public/data/iowa-review/iowa-summary.json";
import styles from "./native-study.module.css";

interface Config {
  dir: string; title: string; dates: [string, string]; stamps: [string, string]; summary: typeof hawaii; intro: string; claim: string;
  noCause: string; granules: [string, string]; track: string; crs: string; days: number;
}
const CONFIG: Record<"hawaii" | "iowa", Config> = {
  hawaii: {
    dir: "hawaii-review", title: "Kīlauea, Hawaiʻi", dates: ["2026-09-04", "2026-09-16"], stamps: ["20260904", "20260916"], summary: hawaii, days: 12,
    intro: "NASA NISAR L-band Frequency A, HH and HV radar backscatter. The same native 10 m grid is shown on both dates, without resampling. This is an exploratory radar-return comparison, not a confirmed lava or eruption-impact map.",
    claim: "They do not independently establish eruption impacts, fresh lava, land-cover change or damage.", noCause: "Colors represent radar backscatter differences, not lava.",
    granules: ["G4300303633-ASF", "G4315672426-ASF"], track: "151 / 11", crs: "EPSG:32605, native grid 449 rows × 427 columns",
  },
  iowa: {
    dir: "iowa-review", title: "Ames, Iowa — mixed land cover", dates: ["2026-09-25", "2026-10-19"], stamps: ["20260925", "20261019"], summary: iowa as unknown as typeof hawaii, days: 24,
    intro: "NASA NISAR L-band Frequency A, HH and HV radar backscatter. The same native 10 m grid is shown on both dates, without resampling. This is an exploratory mixed-land-cover comparison, not a confirmed harvest or crop-change map. The area includes substantial developed land and has not been limited to agricultural fields.",
    claim: "They do not independently establish harvesting, crop change, construction or damage. The selected area contains built-up land as well as possible fields.", noCause: "Colors represent radar backscatter differences, not verified harvesting or crop change.",
    granules: ["G4325945910-ASF", "G4381295241-ASF"], track: "105 / 23", crs: "EPSG:32615, native grid 447 rows × 336 columns",
  },
};

type Mode = "swipe" | "side" | "difference";
const long = (d: string) => fmtDate(d);

/** Review study on the native radar grid: swipe with blended change areas, side by side, or the difference picture. */
export function NativeStudy({ id, pol }: { id: "hawaii" | "iowa"; pol: Pol }) {
  const c = CONFIG[id], [rows, cols] = id === "iowa" ? [447, 336] : [449, 427];
  const [mode, setMode] = useState<Mode>("swipe");
  const [split, setSplit] = useState(50);
  const [showChanges, setShowChanges] = useState(true);
  const [changedOnly, setChangedOnly] = useState(true);
  const [strength, setStrength] = useState(0.6);
  const [overlay, setOverlay] = useState<{ key: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const stats = c.summary.polStats[pol];
  const img = (stamp: string) => dataUrl(`${c.dir}/${stamp}_${pol}.png`);
  const diffUrl = dataUrl(`${c.dir}/${pol}_difference_exploratory.png`);
  const key = `${pol}:${strength}`;
  const needOverlay = mode === "swipe" ? showChanges : mode === "difference" && changedOnly;

  // The overlay is rebuilt from the published difference picture; stale URLs are revoked.
  useEffect(() => {
    if (!needOverlay) return;
    let live = true, made = "";
    const t = window.setTimeout(() => {
      blendedChangeUrl(diffUrl, { threshold: strength, radius: 2 }).then((url) => { made = url; if (live) { setOverlay({ key, url }); setFailed(false); } else URL.revokeObjectURL(url); })
        .catch(() => { if (live) setFailed(true); });
    }, 100);
    return () => { live = false; window.clearTimeout(t); if (made) setTimeout(() => URL.revokeObjectURL(made), 1000); };
  }, [needOverlay, diffUrl, strength, key]);
  const ready = overlay?.key === key ? overlay.url : null;

  const move = (x: number) => { const b = frame.current?.getBoundingClientRect(); if (b?.width) setSplit(Math.min(100, Math.max(0, ((x - b.left) / b.width) * 100))); };
  const down = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setPlaying(false); move(e.clientX); };
  const drag = (e: PointerEvent<HTMLDivElement>) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e.clientX); };
  const key_ = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setSplit((v) => Math.max(0, v - step)); else if (e.key === "ArrowRight") setSplit((v) => Math.min(100, v + step));
    else if (e.key === "Home") setSplit(0); else if (e.key === "End") setSplit(100); else return;
    e.preventDefault();
  };
  // Play sweep: the divider glides across the scene once and settles in the middle.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = 0;
    const tick = (t: number) => {
      t0 ||= t;
      const k = Math.min(1, (t - t0) / 4200);
      setSplit(50 + 50 * Math.sin(2 * Math.PI * k));
      if (k < 1) raf = requestAnimationFrame(tick); else { setSplit(50); setPlaying(false); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const aspect = { aspectRatio: `${cols} / ${rows}` };
  const overlayImg = (cls = "") => ready && <img className={`${styles.overlay} ${cls}`} src={ready} alt="" aria-hidden="true" />;
  return <section id="look" className={styles.root} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{c.title}</h2>
    <p className={styles.lead}>{long(c.dates[0])} versus {long(c.dates[1])} · {c.intro}</p>
    <div className={styles.tools}>
      <div className={styles.seg} role="group" aria-label="Radar comparison view">
        {([["swipe", "Compare dates"], ["side", "Side by side"], ["difference", "Difference"]] as const).map(([m, t]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{t}</button>)}
      </div>
      {mode === "swipe" && <>
        <label className={styles.check}><input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} /> Show changes</label>
        <button type="button" className={styles.action} disabled={playing || prefersReducedMotion()} onClick={() => setPlaying(true)}>Play sweep</button>
      </>}
      {mode === "difference" && <div className={styles.seg} role="group" aria-label="Pixels">
        <button type="button" aria-pressed={changedOnly} onClick={() => setChangedOnly(true)}>Changed pixels</button>
        <button type="button" aria-pressed={!changedOnly} onClick={() => setChangedOnly(false)}>All pixels</button>
      </div>}
      {needOverlay && <label className={styles.check}>Faint<input type="range" min={0.3} max={0.9} step={0.05} value={strength} aria-label="Hide differences weaker than this color strength" onChange={(e) => setStrength(Number(e.target.value))} />Strong</label>}
    </div>
    <div className={styles.panel}>
      {mode === "swipe" && <div ref={frame} className={styles.frame} style={aspect}>
        <img src={img(c.stamps[0])} alt={`${pol} radar image, ${long(c.dates[0])}`} />
        <div className={styles.layer} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <img src={img(c.stamps[1])} alt={`${pol} radar image, ${long(c.dates[1])}`} />
          {showChanges && overlayImg()}
        </div>
        <div className={styles.divider} style={{ left: `${split}%` }} role="slider" tabIndex={0} aria-label="Before and after divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)}
          aria-valuetext={`After on the left: ${Math.round(split)} percent. Before on the right.`} onPointerDown={down} onPointerMove={drag} onKeyDown={key_}><span aria-hidden="true">↔</span></div>
        <span className={`${styles.tag} ${styles.tagL}`}>{showChanges ? "After + changes" : "After"}</span><span className={`${styles.tag} ${styles.tagR}`}>Before</span>
      </div>}
      {mode === "side" && <div className={styles.sidePair}>
        {[0, 1].map((i) => <figure key={i}><figcaption>{i ? "After" : "Before"} · {long(c.dates[i])} · {pol}</figcaption>
          <div className={styles.frame} style={aspect}><img src={img(c.stamps[i])} alt={`${pol} radar return on ${long(c.dates[i])}`} />{i === 1 && showChanges && overlayImg()}</div></figure>)}
      </div>}
      {mode === "difference" && <figure style={{ margin: 0 }} aria-label={`${pol} exploratory NISAR radar-return difference: ${long(c.dates[1])} minus ${long(c.dates[0])}. ${c.noCause}`}>
        <figcaption className={styles.note} style={{ margin: "0 0 10px" }}>{pol} difference: later minus earlier · {changedOnly ? "only strongly changed areas are colored" : "every pixel"} · display clipped at ±6 dB</figcaption>
        <div className={styles.frame} style={{ ...aspect, background: changedOnly ? "#000" : "#f4f0ff" }}>
          {changedOnly ? <><img src={img(c.stamps[1])} alt="" aria-hidden="true" style={{ opacity: 0.55 }} />{overlayImg()}</> : <img src={diffUrl} alt="" aria-hidden="true" />}
        </div>
      </figure>}
      {failed && <p role="alert" className={styles.note}>The change layer could not be drawn. The radar images themselves are unaffected.</p>}
      <div className={styles.legend} aria-label="Legend">
        {(mode !== "difference" ? showChanges : changedOnly) && <><span><i style={{ background: "#e03a2e" }} />Later date brighter</span><span><i style={{ background: "#2f8bff" }} />Later date darker</span><span>Unchanged ground is left uncolored</span></>}
        {mode === "difference" && !changedOnly && <span>Blue = lower later · near-white = about the same · red = higher later</span>}
      </div>
      <p className={styles.note}>Colored areas group neighboring pixels whose color changed most between the dates. This is a display filter on the published difference picture, not a measurement or a detection, and it names no cause. {c.noCause} Native UTM radar image, not a georeferenced map. Grayscale scales are fixed across dates. No independent environmental validation.</p>
    </div>
    <div className={styles.stats}>
      {[["Valid paired pixels", c.summary.commonValidPixels.toLocaleString("en-US")], ["Paired median difference", `${stats.pairedDifferenceMedianDb.toFixed(3)} dB`], ["Paired mean difference", `${stats.pairedDifferenceMeanDb.toFixed(3)} dB`], ["Acquisition interval", `${c.days} days`]].map(([n, v]) =>
        <div className={styles.stat} key={n}><div>{n}</div><strong>{v}</strong></div>)}
    </div>
    <section className={styles.trust} aria-label="Scientific quality and provenance">
      <h3>What we can say — and cannot</h3>
      <p>Both dates cover the same Frequency-A grid, with {c.summary.commonValidPixels.toLocaleString("en-US")} commonly screened HH/HV pixels. The numerical values quantify radar return only. {c.claim}</p>
      <p className={styles.status}><strong>Scientific status:</strong> {c.summary.scientificStatus}. Provisional measurements; official QA interpretation, calibration, radiometric artifacts and noise/RFI/banding remain unresolved.</p>
      <details className={styles.more} open={qaOpen} onToggle={(e) => setQaOpen(e.currentTarget.open)}>
        <summary>Data provenance and QA</summary>
        <div>
          <p><strong>Before:</strong> <a href={`https://cmr.earthdata.nasa.gov/search/concepts/${c.granules[0]}.html`} rel="noopener noreferrer">{c.granules[0]}</a></p>
          <p><strong>After:</strong> <a href={`https://cmr.earthdata.nasa.gov/search/concepts/${c.granules[1]}.html`} rel="noopener noreferrer">{c.granules[1]}</a></p>
          <p><strong>Track/frame:</strong> {c.track}, ascending; P05023; provisional; Frequency A HHHH/HVHV.</p>
          <p><strong>Coordinates:</strong> {c.crs} at 10 m spacing.</p>
          <p><strong>Screening:</strong> Compatibility validator: 74 PASS, 0 FAIL, 10 UNVERIFIED. Frequency B exception-mask screening unresolved; Frequency B not used.</p>
          <p><strong>Distribution:</strong> NASA ASF DAAC NISAR_L2_GCOV_PROVISIONAL_V1. Native-pixel comparison; per-pixel paired medians differ from subtracting the per-date medians.</p>
        </div>
      </details>
    </section>
  </section>;
}
