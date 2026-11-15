"use client";

import { IdentificationQa } from "./identification-qa";
import { useState } from "react";
import type { Pol } from "@/lib/investigation";
import { dataUrl } from "@/lib/investigation";
import summary from "@/public/data/hawaii-review/hawaii-summary.json";

const dates = ["2026-09-04", "2026-09-16"] as const;
const colors = { background: "#101114", panel: "#1b1d21", muted: "#bec0c6", border: "#454951" };

export function HawaiiStudy({ pol }: { pol: Pol }) {
  const [mode, setMode] = useState<"swipe" | "side" | "difference">("swipe");
  const [split, setSplit] = useState(50);
  const [qaOpen, setQaOpen] = useState(false);
  const before = dataUrl(`hawaii-review/20260904_${pol}.png`);
  const after = dataUrl(`hawaii-review/20260916_${pol}.png`);
  const difference = dataUrl(`hawaii-review/${pol}_difference_exploratory.png`);
  const stats = summary.polStats[pol];
  const imageStyle = { width: "100%", display: "block", imageRendering: "pixelated" as const };
  const buttonStyle = (active: boolean) => ({
    padding: "9px 15px", cursor: "pointer", borderRadius: 8, border: `1px solid ${colors.border}`,
    background: active ? "#e9edf2" : colors.panel, color: active ? "#111" : "#f4f4f5", fontWeight: 600,
  });
  return <section id="look" aria-labelledby="hawaii-title" style={{ maxWidth: 1120, margin: "36px auto 90px", padding: "0 20px", color: "#f4f4f5" }}>
    <h2 id="hawaii-title" style={{ fontSize: "clamp(28px,4vw,48px)", marginBottom: 10 }}>Kīlauea, Hawaiʻi</h2>
    <p style={{ color: colors.muted, maxWidth: 800, lineHeight: 1.6 }}>
      September 4 versus September 16, 2026 · NASA NISAR L-band Frequency A · HH and HV radar backscatter.
      The same native 10 m grid is shown across both dates, without resampling. This is an exploratory radar-return comparison, not a confirmed lava or eruption-impact map.
    </p>
    <IdentificationQa />
    <div role="group" aria-label="Radar comparison view" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "22px 0 14px" }}>
      <button type="button" style={buttonStyle(mode === "swipe")} aria-pressed={mode === "swipe"} onClick={() => setMode("swipe")}>Compare dates</button>
      <button type="button" style={buttonStyle(mode === "side")} aria-pressed={mode === "side"} onClick={() => setMode("side")}>Side by side</button>
      <button type="button" style={buttonStyle(mode === "difference")} aria-pressed={mode === "difference"} onClick={() => setMode("difference")}>Difference</button>
    </div>
    <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 16 }}>
      {mode === "swipe" ? <>
        <div style={{ position: "relative", margin: "auto", maxWidth: 650, aspectRatio: "427 / 449", overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
          <img src={before} alt={`${pol} radar image, September 4, 2026`} style={imageStyle} />
          <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
            <img src={after} alt={`${pol} radar image, September 16, 2026`} style={imageStyle} />
          </div>
          <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: `${split}%`, width: 2, background: "#f8f8f8", boxShadow: "0 0 6px #000" }} />
        </div>
        <label htmlFor="hawaii-divider" style={{ display: "block", marginTop: 16, textAlign: "center" }}>
          Slide to compare: September 16 on the left · September 4 on the right
        </label>
        <input id="hawaii-divider" aria-label="Before and after comparison percentage" type="range" min="0" max="100" value={split} onChange={e => setSplit(Number(e.target.value))} style={{ display: "block", width: "min(100%,650px)", margin: "12px auto" }} />
      </> : mode === "side" ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 14 }}>
        {[before, after].map((src, i) => <figure key={src} style={{ margin: 0 }}>
          <figcaption style={{ padding: "0 0 8px" }}>{dates[i]} · {pol}</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
          <img src={src} alt={`${pol} radar return on ${dates[i]}`} style={imageStyle} />
        </figure>)}
      </div> : <figure style={{ margin: "auto", maxWidth: 650 }}>
        <figcaption style={{ paddingBottom: 9 }}>{pol} difference: later minus earlier · blue decreases, red increases · clipped at ±6 dB</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element -- measured static raster */}
        <img src={difference} alt={`${pol} exploratory NISAR radar-return difference: September 16 minus September 4. Colors represent radar backscatter differences, not lava.`} style={imageStyle} />
      </figure>}
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 15 }}>Native UTM radar image, not a georeferenced interactive map overlay. Grayscale scales are fixed across dates; difference colors are display-clipped. No independent environmental validation.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "24px 0" }}>
      {[["Valid paired pixels", summary.commonValidPixels.toLocaleString("en-US")], ["Paired median difference", `${stats.pairedDifferenceMedianDb.toFixed(3)} dB`], ["Paired mean difference", `${stats.pairedDifferenceMeanDb.toFixed(3)} dB`], ["Acquisition interval", "12 days"]].map(([name, value]) =>
        <div key={name} style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 18 }}>
          <div style={{ fontSize: 13, color: colors.muted }}>{name}</div><strong style={{ display: "block", fontSize: 23, marginTop: 5 }}>{value}</strong>
        </div>)}
    </div>
    <section aria-label="Scientific quality and provenance" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 22 }}>
      <h3 style={{ fontSize: 24 }}>What we can say — and cannot</h3>
      <p>Both dates cover the same Frequency-A grid, with {summary.commonValidPixels.toLocaleString("en-US")} commonly screened HH/HV pixels. The numerical values quantify radar return only. They do not independently establish eruption impacts, fresh lava, land-cover change or damage.</p>
      <p style={{ color: "#e9c9a0" }}><strong>Scientific status:</strong> {summary.scientificStatus}. Provisional measurements; official QA interpretation, calibration, radiometric artifacts and noise/RFI/banding remain unresolved.</p>
      <button type="button" onClick={() => setQaOpen(x => !x)} aria-expanded={qaOpen} style={buttonStyle(qaOpen)}> {qaOpen ? "Hide" : "Show"} data provenance and QA </button>
      {qaOpen && <div style={{ marginTop: 18, padding: 18, background: colors.panel, borderRadius: 10, overflowWrap: "anywhere" }}>
        <p><strong>Before:</strong> <a href="https://cmr.earthdata.nasa.gov/search/concepts/G4300303633-ASF.html">G4300303633-ASF</a></p>
        <p><strong>After:</strong> <a href="https://cmr.earthdata.nasa.gov/search/concepts/G4315672426-ASF.html">G4315672426-ASF</a></p>
        <p><strong>Track/frame:</strong> 151 / 11, ascending; P05023; provisional; Frequency A HHHH/HVHV.</p>
        <p><strong>Coordinates:</strong> EPSG:32605, native grid 449 rows × 427 columns at 10 m spacing.</p>
        <p><strong>Screening:</strong> Compatibility validator: 74 PASS, 0 FAIL, 10 UNVERIFIED. Frequency B exception-mask screening unresolved; Frequency B not used.</p>
        <p><strong>Distribution:</strong> NASA ASF DAAC NISAR_L2_GCOV_PROVISIONAL_V1. This study uses native-pixel comparison and reports per-pixel paired medians, which differ from subtracting the per-date medians.</p>
      </div>}
    </section>
  </section>;
}
