"use client";

import { useState } from "react";
import type { Pol } from "@/lib/investigation";
import { dataUrl } from "@/lib/investigation";
import summary from "@/public/data/palm-review/palm-summary.json";

const colors = { panel: "#1b1d21", muted: "#bec0c6", border: "#454951" };
const imageStyle = { width: "100%", display: "block", imageRendering: "pixelated" as const };

export function PalmStudy({ pol }: { pol: Pol }) {
  const [mode, setMode] = useState<"swipe" | "side" | "difference">("swipe");
  const [split, setSplit] = useState(50);
  const [qaOpen, setQaOpen] = useState(false);
  const before = dataUrl(`palm-review/20261005_${pol}.png`);
  const after = dataUrl(`palm-review/20261017_${pol}.png`);
  const difference = dataUrl(`palm-review/${pol}_difference_exploratory.png`);
  const stats = summary.polStats[pol];
  const buttonStyle = (active: boolean) => ({
    padding: "9px 15px", cursor: "pointer", borderRadius: 8, border: `1px solid ${colors.border}`,
    background: active ? "#e9edf2" : colors.panel, color: active ? "#111" : "#f4f4f5", fontWeight: 600,
  });
  return <section id="look" aria-labelledby="palm-title" style={{ maxWidth: 1120, margin: "36px auto 90px", padding: "0 20px", color: "#f4f4f5" }}>
    <h2 id="palm-title" style={{ fontSize: "clamp(28px,4vw,48px)", marginBottom: 10 }}>Palm Jumeirah, Dubai</h2>
    <p style={{ color: colors.muted, maxWidth: 800, lineHeight: 1.6 }}>
      October 5 versus October 17, 2026 · NASA NISAR L-band Frequency A · HH and HV radar backscatter.
      This native 10 m grid compares the same area on both dates without resampling. Radar-return differences are exploratory observations, not evidence of a specific environmental or construction event.
    </p>
    <div role="group" aria-label="Radar comparison view" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "22px 0 14px" }}>
      <button type="button" style={buttonStyle(mode === "swipe")} aria-pressed={mode === "swipe"} onClick={() => setMode("swipe")}>Compare dates</button>
      <button type="button" style={buttonStyle(mode === "side")} aria-pressed={mode === "side"} onClick={() => setMode("side")}>Side by side</button>
      <button type="button" style={buttonStyle(mode === "difference")} aria-pressed={mode === "difference"} onClick={() => setMode("difference")}>Difference</button>
    </div>
    <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 16 }}>
      {mode === "swipe" ? <>
        <div style={{ position: "relative", margin: "auto", maxWidth: 650, aspectRatio: "511 / 451", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
          <img src={before} alt={`${pol} radar image, October 5, 2026`} style={imageStyle} />
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
            <img src={after} alt={`${pol} radar image, October 17, 2026`} style={imageStyle} />
          </div>
          <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: `${split}%`, width: 2, background: "#f8f8f8", boxShadow: "0 0 6px #000" }} />
        </div>
        <label htmlFor="palm-divider" style={{ display: "block", marginTop: 16, textAlign: "center" }}>Slide to compare: October 17 on the left · October 5 on the right</label>
        <input id="palm-divider" type="range" min="0" max="100" value={split} aria-label="Before and after comparison percentage" onChange={e => setSplit(Number(e.target.value))} style={{ display: "block", width: "min(100%,650px)", margin: "12px auto" }} />
      </> : mode === "side" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 14 }}>
        {[before, after].map((src,i) => <figure key={src} style={{ margin: 0 }}>
          <figcaption style={{ padding: "0 0 8px" }}>{summary.dates[i]} · {pol}</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
          <img src={src} alt={`${pol} radar return on ${summary.dates[i]}`} style={imageStyle} />
        </figure>)}
      </div> : <figure style={{ margin: "auto", maxWidth: 650 }}>
        <figcaption style={{ paddingBottom: 9 }}>{pol} difference: later minus earlier · color scale clipped for display</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
        <img src={difference} alt={`${pol} exploratory NISAR radar-return difference: October 17 minus October 5; not proof of a physical cause.`} style={imageStyle} />
      </figure>}
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 15 }}>Native UTM radar image, not a georeferenced interactive map overlay. Identical grayscale display ranges across dates. No independent environmental validation.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "24px 0" }}>
      {[["Common screened pixels", stats.commonValidPixels.toLocaleString("en-US")], ["Paired median difference", `${stats.pairedDifferenceMedianDb.toFixed(3)} dB`], ["Paired mean difference", `${stats.pairedDifferenceMeanDb.toFixed(3)} dB`], ["Acquisition interval", "12 days"]].map(([name, value]) =>
        <div key={name} style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, color: colors.muted }}>{name}</div><strong style={{ display: "block", fontSize: 23, marginTop: 5 }}>{value}</strong>
        </div>)}
    </div>
    <section aria-label="Scientific quality and provenance" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 22 }}>
      <h3 style={{ fontSize: 24 }}>What we can say — and cannot</h3>
      <p>Both dates share the same native Frequency-A grid. The medians and means are computed from paired radar-return differences over the commonly screened pixels. They do not establish a specific physical or environmental cause.</p>
      <p style={{ color: "#e9c9a0" }}><strong>Scientific status:</strong> {summary.scientificStatus}. Official identification-group QA failures and radiometric review remain unresolved.</p>
      <button type="button" onClick={() => setQaOpen(x => !x)} aria-expanded={qaOpen} style={buttonStyle(qaOpen)}>{qaOpen ? "Hide" : "Show"} data provenance and QA</button>
      {qaOpen && <div style={{ marginTop: 18, padding: 18, background: colors.panel, borderRadius: 10, overflowWrap: "anywhere" }}>
        <p><strong>Before:</strong> <a href="https://cmr.earthdata.nasa.gov/search/concepts/G4347479954-ASF.html">G4347479954-ASF</a></p>
        <p><strong>After:</strong> <a href="https://cmr.earthdata.nasa.gov/search/concepts/G4377687641-ASF.html">G4377687641-ASF</a></p>
        <p><strong>Track/frame:</strong> {summary.acquisitions[0].identity.trackNumber} / {summary.acquisitions[0].identity.frameNumber}, descending; Frequency A HH/HV.</p>
        <p><strong>Grid:</strong> {summary.crs}, {summary.nativeShape[0]} rows × {summary.nativeShape[1]} columns at 10 m spacing.</p>
        <p><strong>Source:</strong> NASA–ISRO NISAR L2 GCOV via ASF DAAC; collection maturity must be verified from the official catalog before claiming provisional, beta or validated status.</p>
        <ul>{summary.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        <p>Paired median differences are not the same statistic as subtracting the two individual-date medians.</p>
      </div>}
    </section>
  </section>;
}
