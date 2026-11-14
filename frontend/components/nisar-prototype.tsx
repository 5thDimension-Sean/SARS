"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ProcessedOverlayPanel } from "./processed-overlay-panel";
import { InvestigationMap, type ViewMode } from "./investigation/investigation-map";
import { Histogram } from "./investigation/histogram";
import styles from "./investigation/investigation.module.css";
import { verifyBrowsePair } from "@/lib/nisar-browse";
import {
  NO_CAUSE_NOTICE, POLS, QA_LABEL, STUDIES, dataUrl, describeRegion, describeStudyShift, fmtDate, fmtDb, fmtInt, fmtSignedDb,
  parseEvidence, parsePreview, parseRegions, qaLabel, qaState,
  type Evidence, type Pol, type PreviewSet, type Region, type RegionSet, type StudyConfig,
} from "@/lib/investigation";

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; evidence: Evidence; regions: RegionSet; preview: PreviewSet | null; previewNote: string };

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(dataUrl(path), { signal, credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return <div className={styles.group} role="group" aria-label={label}>
    <span className={styles.groupLabel} aria-hidden="true">{label}</span>
    {options.map((o) => <button key={o.id} type="button" className={styles.seg} aria-pressed={value === o.id} disabled={o.disabled} onClick={() => onChange(o.id)}>{o.text}</button>)}
  </div>;
}

export function NisarPrototype() {
  const [studyId, setStudyId] = useState<StudyConfig["id"]>("everglades");
  const [pol, setPol] = useState<Pol>("HH");
  const study = STUDIES.find((s) => s.id === studyId)!;
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>SAR-Waltz · NISAR Scientific Evidence</p><h1>What does NISAR radar show — and what can&apos;t it tell us yet?</h1></div>
        <Link href="/">Return to educational demo</Link>
      </header>
      <p className={styles.lead}>A guided look at two real NASA NISAR radar acquisitions per location: see the images, inspect three candidate regions, read the measured numbers, then check the quality evidence. Everything here is <strong>exploratory</strong>.</p>
    </div>
    <div className={styles.sticky}>
      <div className={`${styles.wrap} ${styles.stickyRow}`}>
        <Seg label="Location" value={studyId} options={STUDIES.map((s) => ({ id: s.id, text: s.label }))} onChange={setStudyId} />
        <Seg label="Polarization" value={pol} options={POLS.map((p) => ({ id: p, text: p }))} onChange={setPol} />
        <span className={styles.qaChip} role="note"><code>{QA_LABEL}</code><span>Not cleared for quantitative analysis</span></span>
      </div>
      <nav className={`${styles.wrap}`} aria-label="Investigation steps">
        <ol className={styles.stepNav}>
          <li><a href="#step-look">1 · Look at the radar</a></li><li><a href="#step-region">2 · Inspect a region</a></li>
          <li><a href="#step-scene">3 · Compare the whole scene</a></li><li><a href="#step-trust">4 · Check the evidence</a></li>
        </ol>
      </nav>
    </div>
    <div className={styles.wrap}>
      <Primer />
      <Workbench key={study.id} study={study} pol={pol} onPol={setPol} />
    </div>
  </main>;
}

function Primer() {
  return <details className={styles.more}>
    <summary>New to radar? Read this first: SAR in one minute</summary>
    <div className={styles.cards}>
      <div className={styles.card}><h3>Backscatter</h3><p>NISAR sends microwave pulses to the ground and records how much comes back. It works through cloud and at night. Bright pixel = strong return; dark pixel = weak return. It is <em>not</em> a photograph.</p></div>
      <div className={styles.card}><h3>Decibels (dB)</h3><p>Backscatter is shown on a log scale. Every −10 dB is ten times less returned power; about 3 dB is a doubling or halving. Differences below about 1 dB are small.</p></div>
      <div className={styles.card}><h3>HH and HV</h3><p>Two ways of sending and receiving the radar wave. HH is the stronger channel; HV is much weaker and responds differently to the surface. Compare each with itself across dates, never HH with HV.</p></div>
      <div className={styles.card}><h3>Why a change isn&apos;t a cause</h3><p>Surface roughness, moisture, vegetation structure, instrument noise and processing all alter backscatter. A difference between two dates does not by itself say which of these happened.</p></div>
    </div>
  </details>;
}

function Workbench({ study, pol, onPol }: { study: StudyConfig; pol: Pol; onPol: (p: Pol) => void }) {
  const [data, setData] = useState<Loaded>({ status: "loading" });
  const [mode, setMode] = useState<ViewMode>("swipe");
  const [selected, setSelected] = useState("all");
  const [resetSignal, setResetSignal] = useState(0);
  const [problem, setProblem] = useState("");
  const [afterMap, setAfterMap] = useState<MapLibreMap | null>(null);
  const [processedLabel, setProcessedLabel] = useState("");
  const [gibsReady, setGibsReady] = useState(false);
  const [gibsVisible, setGibsVisible] = useState(true);
  const [gibsNote, setGibsNote] = useState(study.gibsContext ? "Checking NASA GIBS context imagery…" : "");

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const [ev, meta, geo] = await Promise.all([
          getJson(`${study.evidenceDir}/evidence.json`, ac.signal),
          getJson(`${study.regionsDir}/regions.json`, ac.signal),
          getJson(`${study.regionsDir}/regions.geojson`, ac.signal),
        ]);
        const evidence = parseEvidence(ev, study), regions = parseRegions(meta, geo, study);
        let preview: PreviewSet | null = null, previewNote = "";
        if (study.previewDir) {
          try { preview = parsePreview(await getJson(`${study.previewDir}/preview-manifest.json`, ac.signal), study); }
          catch { previewNote = "Single-date radar previews could not be loaded or validated, so only the exploratory difference map is shown."; }
        } else previewNote = `Single-date HH/HV radar previews have not been published for ${study.label} yet. The swipe and side-by-side views are therefore unavailable; the exploratory difference map, histograms and statistics below are real.`;
        if (!ac.signal.aborted) setData({ status: "ready", evidence, regions, preview, previewNote });
      } catch (error) {
        if (!ac.signal.aborted) setData({ status: "error", message: `The published evidence for ${study.label} could not be loaded or failed validation (${error instanceof Error ? error.message : "unknown error"}). No substitute data is shown.` });
      }
    })();
    return () => ac.abort();
  }, [study]);

  // NASA GIBS is optional context. If it fails the measured previews are unaffected.
  useEffect(() => {
    if (!study.gibsContext) return;
    const ac = new AbortController();
    void verifyBrowsePair(ac.signal).then((ok) => {
      if (ac.signal.aborted) return;
      setGibsReady(ok);
      setGibsNote(ok ? "NASA GIBS browse mosaic available as coarse background context." : "NASA GIBS coverage for both dates could not be confirmed, so the context layer is off.");
    }).catch(() => { if (!ac.signal.aborted) setGibsNote("NASA GIBS context imagery is unreachable right now. The radar previews below do not depend on it."); });
    return () => ac.abort();
  }, [study]);

  const onGibsFail = useCallback(() => { setGibsReady(false); setGibsNote("NASA GIBS tiles failed to load; context layer disabled. Radar previews are unaffected."); }, []);

  if (data.status === "loading") return <p role="status" className={styles.notice}>Loading published evidence for {study.label}…</p>;
  if (data.status === "error") return <p role="alert" className={`${styles.notice} ${styles.error}`}>{data.message}</p>;
  const { evidence, regions, preview, previewNote } = data;
  const effectiveMode: ViewMode = preview ? mode : "difference";
  const region = regions.regions.find((r) => r.id === selected) ?? null;
  const pe = evidence.pols[pol];

  return <>
    <section className={styles.section} id="step-look" aria-labelledby="h-look">
      <h2 id="h-look"><span className={styles.stepNo}>1</span>Look at the radar: {study.label}</h2>
      <p className={styles.muted}>{fmtDate(study.dates[0])} and {fmtDate(study.dates[1])} · NISAR L2 GCOV (provisional) · polarization {pol}. {preview ? "Drag the divider to compare the dates, or switch to side-by-side." : ""}</p>
      {previewNote && <p className={styles.notice} role="note">{previewNote}</p>}
      <div className={styles.banner} role="note">
        <strong>{QA_LABEL}.</strong> <span>{NO_CAUSE_NOTICE} Official quality checks are not cleared (see step 4), so none of the numbers here are validated measurements of change.</span>
      </div>
      <div className={styles.viewer}>
        <div>
          <div className={styles.viewTools}>
            <Seg label="View" value={effectiveMode} onChange={setMode} options={[
              { id: "swipe", text: "Swipe", disabled: !preview }, { id: "side", text: "Side by side", disabled: !preview }, { id: "difference", text: "Exploratory difference" }]} />
            <button type="button" className={styles.seg} onClick={() => { setSelected("all"); setResetSignal((n) => n + 1); }}>Reset view</button>
            {study.gibsContext && <label className={styles.small}><input type="checkbox" checked={gibsReady && gibsVisible} disabled={!gibsReady} onChange={(e) => setGibsVisible(e.target.checked)} /> NASA GIBS context</label>}
          </div>
          {problem && <p role="alert" className={`${styles.notice} ${styles.error}`}>{problem}</p>}
          <InvestigationMap study={study} regions={regions} preview={preview} pol={pol} mode={effectiveMode} selectedId={selected} onSelect={setSelected}
            gibsReady={gibsReady} gibsVisible={gibsVisible} onGibsFail={onGibsFail} onProblem={setProblem} onAfterMap={setAfterMap} resetSignal={resetSignal} />
          <Legend mode={effectiveMode} pol={pol} preview={preview} regions={regions} />
          <p className={`${styles.small} ${styles.muted}`}>Pixels are drawn exactly as published (nearest-neighbour; no smoothing, sharpening or enhancement); one pixel is about 10 m. {gibsNote}</p>
        </div>
        <aside id="step-region" className={styles.inspector} aria-labelledby="h-region">
          <h2 id="h-region" style={{ fontSize: 20, fontWeight: 650 }}><span className={styles.stepNo}>2</span>Inspect a region</h2>
          <div className={styles.chips} role="group" aria-label="Investigation region">
            <button type="button" className={styles.chip} aria-pressed={selected === "all"} onClick={() => setSelected("all")}><b>Whole scene</b><small>All pixels</small></button>
            {regions.regions.map((r) => <button key={r.id} type="button" className={styles.chip} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}><b>Region {r.id}</b><small>{r.title}</small></button>)}
          </div>
          {region ? <RegionDetail region={region} pol={pol} onPol={onPol} dates={study.dates} regions={regions} /> :
            <div className={styles.card}><h3>Whole scene, {pol}</h3><p>{describeStudyShift(pol, pe, study.dates)}</p>
              <p className={styles.muted} style={{ marginTop: 8 }}>Select Region A, B or C (here or on the map) to zoom in. The regions come from an exploratory search for pixel-level differences, so they illustrate variation rather than typical conditions.</p></div>}
        </aside>
      </div>
    </section>

    <section className={styles.section} id="step-scene" aria-labelledby="h-scene">
      <h2 id="h-scene"><span className={styles.stepNo}>3</span>Compare the whole scene ({pol})</h2>
      <div className={styles.twoCol}>
        <div className={styles.card}>
          <Histogram pol={pol} ev={pe} dates={study.dates} />
          <p className={`${styles.small} ${styles.muted}`}>Each line counts how many of the screened pixels fall in each 0.52 dB bin. Pixels outside the fixed display range ({fmtInt(pe.observations[0].outsideDisplayRange)} and {fmtInt(pe.observations[1].outsideDisplayRange)}) are not in the bins.</p>
          <details className={styles.more}><summary>Original analysis figure and bin counts</summary>
            {/* eslint-disable-next-line @next/next/no-img-element -- static export; analysis figure is shown exactly as published */}
            <img className={styles.figure} src={dataUrl(`${study.evidenceDir}/${pe.histogramImage}`)} alt={`${pol} backscatter histogram comparing ${fmtDate(study.dates[0])} and ${fmtDate(study.dates[1])}, as published with the evidence package.`} loading="lazy" />
            <div className={styles.tableScroll}><table className={styles.table}><caption>Pixels per bin ({pol})</caption>
              <thead><tr><th scope="col">Bin (dB)</th><th scope="col">{fmtDate(study.dates[0])}</th><th scope="col">{fmtDate(study.dates[1])}</th></tr></thead>
              <tbody>{pe.bins.map((b) => <tr key={b.lowDb}><th scope="row">{b.lowDb.toFixed(2).replace("-", "−")} to {b.highDb.toFixed(2).replace("-", "−")}</th><td>{fmtInt(b.counts[0])}</td><td>{fmtInt(b.counts[1])}</td></tr>)}</tbody></table></div>
          </details>
        </div>
        <div className={styles.card}>
          <div className={styles.tableScroll}><table className={styles.table}>
            <caption>{pol} backscatter summary, gamma-0 in dB</caption>
            <thead><tr><th scope="col">Statistic</th><th scope="col">{fmtDate(study.dates[0])}</th><th scope="col">{fmtDate(study.dates[1])}</th><th scope="col">Later − earlier*</th></tr></thead>
            <tbody>
              <tr className={styles.key}><th scope="row">Median</th><td>{fmtDb(pe.observations[0].medianDb)}</td><td>{fmtDb(pe.observations[1].medianDb)}</td><td>{fmtSignedDb(pe.differenceOfRegionalMediansDb)}</td></tr>
              <tr className={styles.key}><th scope="row">Mean</th><td>{fmtDb(pe.observations[0].meanDb)}</td><td>{fmtDb(pe.observations[1].meanDb)}</td><td>{fmtSignedDb(pe.differenceOfRegionalMeansDb)}</td></tr>
              <tr><th scope="row">5th percentile</th><td>{fmtDb(pe.observations[0].p05Db)}</td><td>{fmtDb(pe.observations[1].p05Db)}</td><td /></tr>
              <tr><th scope="row">95th percentile</th><td>{fmtDb(pe.observations[0].p95Db)}</td><td>{fmtDb(pe.observations[1].p95Db)}</td><td /></tr>
              <tr><th scope="row">Standard deviation</th><td>{fmtDb(pe.observations[0].stdDb)}</td><td>{fmtDb(pe.observations[1].stdDb)}</td><td /></tr>
              <tr><th scope="row">Screened pixels</th><td>{fmtInt(pe.observations[0].count)}</td><td>{fmtInt(pe.observations[1].count)}</td><td /></tr>
            </tbody></table></div>
          <p className={styles.small} style={{ marginTop: 8 }}>*Difference of two separate regional summaries. It is <strong>not</strong> a per-pixel change measurement, and the two dates may not retain exactly the same pixels.</p>
          <p style={{ marginTop: 12 }}>{describeStudyShift(pol, pe, study.dates)}</p>
        </div>
      </div>
    </section>

    <TrustSection study={study} evidence={evidence} regions={regions} preview={preview} />

    <details className={styles.more}>
      <summary>Processed GCOV products (advanced)</summary>
      <div className={styles.products}><ProcessedOverlayPanel map={afterMap} onDisplay={setProcessedLabel} />{processedLabel && <p role="status">Showing: {processedLabel}</p>}</div>
    </details>
  </>;
}

function Legend({ mode, pol, preview, regions }: { mode: ViewMode; pol: Pol; preview: PreviewSet | null; regions: RegionSet }) {
  if (mode === "difference") {
    const [lo, hi] = regions.limitsDb;
    return <div className={styles.legend}><div>Exploratory difference ({pol}, after dB minus before dB, paired pixels), clipped at ±{hi} dB:</div>
      <div className={styles.ramp} style={{ background: "linear-gradient(90deg,#1010ff,#f4f0ff 50%,#ff1010)" }} role="img" aria-label={`Blue is negative, near-white is zero, red is positive, clipped at ${lo} and ${hi} dB`} />
      <div className={styles.rampLabels}><span>{fmtSignedDb(lo, 0)} (lower later)</span><span>0</span><span>{fmtSignedDb(hi, 0)} (higher later)</span></div>
      <div>The fine speckled pattern is the pixel-to-pixel variation described in step 2; colors are not a flood or vegetation map.</div></div>;
  }
  const range = preview?.acquisitions[0].images[pol].displayRangeDb;
  if (!range) return null;
  return <div className={styles.legend}><div>{pol} backscatter, gamma-0 (display scale, same on both dates):</div>
    <div className={styles.ramp} style={{ background: "linear-gradient(90deg,#000,#fff)" }} role="img" aria-label={`Black is ${range[0]} dB, white is ${range[1]} dB`} />
    <div className={styles.rampLabels}><span>{fmtDb(range[0], 0)} (weak return)</span><span>{fmtDb(range[1], 0)} (strong return)</span></div></div>;
}

function RegionDetail({ region, pol, onPol, dates, regions }: { region: Region; pol: Pol; onPol: (p: Pol) => void; dates: StudyConfig["dates"]; regions: RegionSet }) {
  const s = region.stats[pol];
  return <div className={styles.card} style={{ display: "grid", gap: 10 }}>
    <h3>Region {region.id}: {region.title}</h3>
    <span className={styles.status}>{regions.scientificStatus}</span>
    <div className={styles.big} aria-label={`Median of paired ${pol} differences`}>{fmtSignedDb(s.paired.medianDifferenceDb, 3)} <span className={`${styles.small} ${styles.muted}`}>median {pol} pixel difference</span></div>
    <p>{describeRegion(pol, region, dates)}</p>
    <div className={styles.tableScroll}><table className={styles.table}>
      <caption>Region {region.id} · {pol} · {fmtInt(s.paired.pixels)} paired pixels</caption>
      <tbody>
        <tr><th scope="row">Median on {fmtDate(dates[0])}</th><td>{fmtDb(s.beforeMedianDb, 3)}</td></tr>
        <tr><th scope="row">Median on {fmtDate(dates[1])}</th><td>{fmtDb(s.afterMedianDb, 3)}</td></tr>
        <tr className={styles.key}><th scope="row">Median of per-pixel differences</th><td>{fmtSignedDb(s.paired.medianDifferenceDb, 3)}</td></tr>
        <tr><th scope="row">Mean of per-pixel differences</th><td>{fmtSignedDb(s.paired.meanDifferenceDb, 3)}</td></tr>
        <tr><th scope="row">5th to 95th percentile of differences</th><td>{fmtSignedDb(s.paired.p05DifferenceDb, 2)} to {fmtSignedDb(s.paired.p95DifferenceDb, 2)}</td></tr>
      </tbody></table></div>
    <p className={styles.small}>The median of per-pixel differences is not the same as subtracting the two medians above; it is computed pixel by pixel.</p>
    <div className={styles.tableScroll}><table className={styles.table}>
      <caption>Both polarizations (median per-pixel difference)</caption>
      <thead><tr>{POLS.map((p) => <th key={p} scope="col"><button type="button" className={styles.seg} aria-pressed={p === pol} onClick={() => onPol(p)}>{p}</button></th>)}</tr></thead>
      <tbody><tr>{POLS.map((p) => <td key={p} style={{ textAlign: "center" }}>{fmtSignedDb(region.stats[p].paired.medianDifferenceDb, 3)}</td>)}</tr></tbody></table></div>
    {region.interpretation && <p><strong>Interpretation from the analysis:</strong> {region.interpretation}</p>}
    <p className={`${styles.small} ${styles.muted}`}>Selection: {region.selectionMethod}. Not independently validated; no flooding, vegetation loss or damage is claimed.</p>
  </div>;
}

function TrustSection({ study, evidence, regions, preview }: { study: StudyConfig; evidence: Evidence; regions: RegionSet; preview: PreviewSet | null }) {
  return <section className={styles.section} id="step-trust" aria-labelledby="h-trust">
    <h2 id="h-trust"><span className={styles.stepNo}>4</span>Check the evidence: quality and provenance</h2>
    <div className={styles.banner} role="note"><strong>{evidence.scientificClearance}.</strong> <span>{QA_LABEL}: failed or unverified checks stay visible below. This is a status report, not a confidence score.</span></div>
    <div className={styles.twoCol}>
      <div>
        <h3>Quality checks for {study.label}</h3>
        <ul className={styles.qaList}>{evidence.quality.map(([key, text]) => { const state = qaState(text);
          return <li key={key}><span className={`${styles.qaIcon} ${styles[`qa_${state}`]}`}>{state === "pass" ? "PASS" : state === "fail" ? "FAIL" : "UNVERIFIED"}</span><span><strong>{qaLabel(key)}</strong><br />{text}</span></li>; })}</ul>
        <h3 style={{ marginTop: 16 }}>Known limitations</h3>
        <ul className={styles.more} style={{ listStyle: "disc", paddingLeft: 22 }}>{evidence.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className={styles.yesno}>
          <div className={styles.card}><h3>What this shows</h3><ul><li>Real NISAR HH/HV backscatter on two dates, summarized as histograms and statistics.</li><li>Three candidate regions with measured per-pixel differences, labeled {QA_LABEL}.</li></ul></div>
          <div className={styles.card}><h3>What it does not show</h3><ul><li>Flooding, vegetation loss, damage or ground displacement.</li><li>A validated change detection, a confidence score or a prediction.</li></ul></div>
        </div>
      </div>
      <div className={styles.card}>
        <h3>Data provenance</h3>
        <dl className={styles.dl}>
          <dt>Source</dt><dd>{evidence.provenance}</dd>
          <dt>Measurement</dt><dd>{evidence.measurement}</dd>
          <dt>Acquisitions</dt>
          <dd>{study.dates.map((d, i) => <span key={d}>{i ? <br /> : null}{fmtDate(d)} · <a href={`https://cmr.earthdata.nasa.gov/search/concepts/${study.granules[i]}.html`} rel="noopener noreferrer">{study.granules[i]}</a>{preview ? ` · track ${preview.acquisitions[i].track}, frame ${String(preview.acquisitions[i].frame).padStart(3, "0")}` : ""}</span>)}</dd>
          <dt>Grid</dt><dd>{regions.crs}, {Math.abs(regions.pixelSpacingMeters[0])} m pixels, {regions.nativeShape[1]}×{regions.nativeShape[0]} (columns × rows); {fmtInt(regions.pairedPixels)} paired HH/HV pixels</dd>
          <dt>Difference map</dt><dd>{regions.differenceDefinition}</dd>
          {preview && <><dt>Preview imagery</dt><dd>{preview.sourceCollection}. {preview.measurement}. Single-date previews, QA: {preview.scientificClearance}.</dd></>}
          <dt>Collection</dt><dd>NISAR_L2_GCOV_PROVISIONAL_V1 · <a href="https://doi.org/10.5067/NIL2GCOV-P1" rel="noopener noreferrer">Dataset DOI</a></dd>
        </dl>
        {study.gibsContext && <p className={styles.small} style={{ marginTop: 12 }}>GIBS context: we acknowledge the use of imagery from the NASA Global Imagery Browse Services (GIBS), part of NASA&apos;s Earth Science Data and Information System (ESDIS). GIBS mosaics may combine products and are not pixel-level lineage.</p>}
        <p className={styles.small} style={{ marginTop: 8 }}><a href="https://hyp3-docs.asf.alaska.edu/nisar-docs/worldview/" rel="noopener noreferrer">ASF imagery guide</a> · <a href="https://nisar-docs.asf.alaska.edu/provisional-known-issues/" rel="noopener noreferrer">Provisional-data limitations</a> · <a href="https://nasa-gibs.github.io/gibs-api-docs/" rel="noopener noreferrer">NASA GIBS</a></p>
      </div>
    </div>
  </section>;
}
