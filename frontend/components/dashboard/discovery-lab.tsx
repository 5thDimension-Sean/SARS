"use client";
import { useState } from "react";
import { evidenceRows, investigationReport, type Investigation } from "@/lib/evidence";
const tools = ["Investigate", "Radar / Optical", "Check Evidence", "Earth’s Waltz", "Make a Report", "1-Minute Tour"];
const steps = ["Choose a location. Sample locations illustrate concepts; processed GCOV is available only when supplied.", "Choose two acquisition dates and a shared polarization. Same-day selection cannot measure temporal change.", "Compare the radar images using the swipe. Colors alone cannot establish a numerical difference.", "Inspect evidence and limitations. GCOV measures backscatter, not displacement or a physical cause.", "Download a labeled report and seek independent evidence before drawing a conclusion."];
export function DiscoveryLab({ investigation, onPlay, playing = false }: { investigation: Investigation; onPlay?: () => void; playing?: boolean }) {
  const [tool, setTool] = useState(0), [step, setStep] = useState(0);
  const download = () => {
    const url = URL.createObjectURL(new Blob([investigationReport(investigation)], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "sar-waltz-investigation.html"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="discovery-lab"><summary>Explore tools <small>{investigation.mode === "sample" ? "SAMPLE · NO OBSERVED DATA" : "DERIVED GCOV · QA UNVERIFIED"}</small></summary>
    <div role="group" aria-label="Discovery Lab tools" className="lab-tools">{tools.map((name, i) => <button key={name} aria-pressed={tool === i} onClick={() => setTool(i)}>{name}</button>)}</div>
    <section className="lab-content" aria-label={tools[tool]}>
      <h2>{tools[tool]}</h2>
      {tool === 0 && <p>{investigation.mode === "sample" ? "This is a fictional sample. No numerical ROI or measured change is available." : "Inspect the supplied frame metadata and rasters. Local quantitative ROI analysis is withheld until common-support masks and scientific QA are validated."} Image colors are never converted into dB measurements.</p>}
      {tool === 1 && <p>No aligned optical image has been supplied. Radar records microwave response; optical imagery records reflected sunlight. A comparison requires a locally supplied, aligned image with its acquisition date, source and credit.</p>}
      {tool === 2 && <><p>Evidence checklist, not a confidence score.</p><ul>{evidenceRows(investigation).map((row) => <li key={row.label}><strong>{row.status} — {row.label}:</strong> {row.detail}</li>)}</ul></>}
      {tool === 3 && <><p>{investigation.mode === "sample" ? "Timeline dates and signals are fictional illustrations." : "Playback uses only supplied acquisition dates. No intermediate observations are invented; frame-wide statistics are not a pixel time series."}</p>{onPlay && <button onClick={onPlay}>{playing ? "Pause" : "Play"} acquisition sequence</button>}</>}
      {tool === 4 && <><p>Download an HTML report with source, dates, polarization, evidence gaps and scientific limits. Print it from your browser to save a PDF.</p><button onClick={download}>Download investigation report</button></>}
      {tool === 5 && <><p>Step {step + 1} of {steps.length}: {steps[step]}</p><button disabled={step === 0} onClick={() => setStep(step - 1)}>Previous tour step</button> <button disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>Next tour step</button></>}
    </section>
  </details>;
}
