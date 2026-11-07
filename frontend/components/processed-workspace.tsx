"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadManifest, type ProcessedManifest, type ProcessedFrame, type Pol } from "@/lib/processed-data";
import { assetPath } from "@/lib/site-path";
import { DiscoveryLab } from "./dashboard/discovery-lab";
export function ProcessedWorkspace() {
  const [manifest, setManifest] = useState<ProcessedManifest | null>(null), [message, setMessage] = useState("Loading offline processed data…"), [attempt, setAttempt] = useState(0), [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadManifest(assetPath("data/manifest.json"), controller.signal).then((m) => {
      if (controller.signal.aborted) return;
      setManifest(m); setFrameIndex(0); setMessage(m?.frames.length ? "" : "No processed GCOV data has been supplied. No measured radar results are available.");
    }).catch(() => { if (!controller.signal.aborted) { setManifest(null); setMessage("Processed data is invalid or unavailable. No measurements can be shown. Check the manifest and files, then retry."); } });
    return () => controller.abort();
  }, [attempt]);
  return <main className="data-workspace"><nav><Link href="/">Educational demo</Link> · <Link href="/nisar-prototype">NASA browse imagery</Link></nav><h1>Processed GCOV</h1><p>Offline derived backscatter. Scientific QA and independent verification remain unconfirmed. GCOV does not measure ground displacement.</p>
    {message && <p role="status">{message}</p>}<button onClick={() => setAttempt(attempt + 1)}>Reload processed data</button>
    {!!manifest?.frames.length && <><label>Frame <select value={frameIndex} onChange={(e) => setFrameIndex(Number(e.target.value))}>{manifest.frames.map((f, i) => <option value={i} key={f.id}>{f.label}</option>)}</select></label><FrameWorkspace key={`${attempt}-${frameIndex}`} frame={manifest.frames[frameIndex]} manifest={manifest} /></>}
    <details><summary>Preparing real data</summary><p>Inspect source HDF5 and review calibration, masks and official QA offline using the Python pipeline. Copy the full processed output to public/data and rebuild. The public website accepts no raw HDF5 uploads or credentials. The current Everglades pair is NOT CLEARED for quantitative analysis.</p></details>
  </main>;
}
function FrameWorkspace({ frame, manifest }: { frame: ProcessedFrame; manifest: ProcessedManifest }) {
  const [index, setIndex] = useState(frame.acquisitions.length - 1), [baseline, setBaseline] = useState(0), [pol, setPol] = useState<Pol>(frame.acquisitions[0].pols[0]), [swipe, setSwipe] = useState(50), [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false);
  const before = frame.acquisitions[Math.min(baseline, index)], after = frame.acquisitions[index];
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((i) => { if (i >= frame.acquisitions.length - 1) { setPlaying(false); return i; } return i + 1; }), 1400);
    return () => window.clearInterval(timer);
  }, [playing, frame.acquisitions.length]);
  const setDate = (i: number) => { setIndex(i); setBaseline((b) => Math.min(b, i)); setPlaying(false); };
  const togglePlay = () => { if (!playing && index === frame.acquisitions.length - 1) { setIndex(0); setBaseline(0); } setPlaying(!playing); };
  const versionsMatch = before.productVersion === after.productVersion && before.compositeReleaseId === after.compositeReleaseId && before.dataMaturity === after.dataMaturity && before.dataMaturity !== "UNKNOWN";
  const available = before.overlays[pol] && after.overlays[pol];
  const histogram = after.histogramDb[pol];
  return <section><div className="processed-controls"><label>Before <select value={baseline} onChange={(e) => { setBaseline(Number(e.target.value)); setPlaying(false); }}>{frame.acquisitions.slice(0, index + 1).map((a, i) => <option value={i} key={a.date}>{a.date}</option>)}</select></label><label>After <select value={index} onChange={(e) => setDate(Number(e.target.value))}>{frame.acquisitions.map((a, i) => <option value={i} key={a.date}>{a.date}</option>)}</select></label><label>Polarization <select value={pol} onChange={(e) => setPol(e.target.value as Pol)}><option>HH</option><option>HV</option></select></label><button disabled={frame.acquisitions.length < 2} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button></div>
    <p>DERIVED · {manifest.source} · {frame.passDirection} · Bounds: {frame.bounds.join(", ")} · Display range: {manifest.dbRanges[pol]?.join(" to ")} dB</p>
    {!versionsMatch && <p role="status">Processing versions or maturity differ or are unknown. No quantitative comparison is available.</p>}
    {available && !failed ? <div className="processed-comparison" style={{ aspectRatio: frame.overlaySize.join(" / ") }}>
      {/* Static locally supplied assets: no optimization service or remote URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetPath(`data/${before.overlays[pol]}`)} alt={`Before ${before.date}, ${pol} derived backscatter`} onError={() => setFailed(true)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img style={{ clipPath: `inset(0 0 0 ${swipe}%)` }} src={assetPath(`data/${after.overlays[pol]}`)} alt={`After ${after.date}, ${pol} derived backscatter`} onError={() => setFailed(true)} />
    </div> : <p role="status">Raster unavailable for the selected polarization. No synthetic substitute is shown.</p>}
    <label>Before/after swipe <input aria-label="Processed before and after swipe" type="range" min="0" max="100" value={swipe} disabled={!available || failed} onChange={(e) => setSwipe(Number(e.target.value))} /></label>
    <p>Grayscale shows fixed-range backscatter. Apparent changes are not detections. Temporal difference layers and quantitative ROI are withheld pending common-support masking and QA review.</p>
    <DiscoveryLab investigation={{ label: frame.label, mode: "derived", before: before.date, after: after.date, polarization: pol, source: manifest.source, versionsMatch, numericAvailable: false, notes: [...manifest.processingNotes, `Sources: ${before.sourceFile}; ${after.sourceFile}`, `Versions/releases/maturity: ${before.productVersion}/${before.compositeReleaseId}/${before.dataMaturity}; ${after.productVersion}/${after.compositeReleaseId}/${after.dataMaturity}`, `Track/frame/pass: ${frame.track}/${frame.frame}/${frame.passDirection}; bounds ${frame.bounds.join(", ")}`] }} onPlay={togglePlay} playing={playing} />
    <details><summary>Charts and acquisition metadata</summary><h2>Frame-wide mean dB over time</h2><p>Reduced-raster statistic, not a pixel-level time series. Means on separate dates may use different valid support.</p><table><thead><tr><th>Date</th><th>Mean dB</th><th>Valid reduced pixels</th></tr></thead><tbody>{frame.acquisitions.map((a) => <tr key={a.date}><td>{a.date}</td><td>{a.statisticsDb[pol]?.mean ?? "Unavailable"}</td><td>{a.statisticsDb[pol]?.validPixelCount ?? "Unavailable"}</td></tr>)}</tbody></table>
      <h2>Selected acquisition histogram</h2>{histogram ? <table><thead><tr><th>dB interval</th><th>Count</th><th>Fraction of valid reduced pixels</th></tr></thead><tbody>{histogram.counts.map((count, i) => <tr key={i}><td>{histogram.edges[i]} to {histogram.edges[i + 1]}</td><td>{count}</td><td>{histogram.normalized[i]}</td></tr>)}</tbody></table> : <p>No histogram for this polarization.</p>}
      <dl><dt>Source file</dt><dd>{after.sourceFile}</dd><dt>Version / release / maturity</dt><dd>{after.productVersion} / {after.compositeReleaseId} / {after.dataMaturity}</dd><dt>Orbit</dt><dd>{after.orbit}</dd><dt>Generated</dt><dd>{manifest.generated}</dd></dl>{after.cog[pol] && <a href={assetPath(`data/${after.cog[pol]}`)} download>Download selected COG</a>}
    </details>
  </section>;
}
