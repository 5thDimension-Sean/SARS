"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ProcessedOverlayPanel } from "./processed-overlay-panel";
import dynamic from "next/dynamic";
import type { InvestigationMap, ViewMode } from "./investigation/investigation-map";
import { RadarHero, Reveal, ConnectionStatus } from "./investigation/radar-hero";
const LazyMap = dynamic(() => import("./investigation/investigation-map").then(m => m.InvestigationMap), { ssr: false });
function MapGate(props: React.ComponentProps<typeof InvestigationMap>) {
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    if (!("IntersectionObserver" in window)) { const id = requestAnimationFrame(() => setNear(true)); return () => cancelAnimationFrame(id); }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); observer.disconnect(); } }, { rootMargin: "400px" });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  return <div ref={root}>{near ? <LazyMap {...props} /> : <div className={styles.mapSkeleton} role="status">Preparing the radar workbench…</div>}</div>;
}
import { Histogram } from "./investigation/histogram";
import styles from "./investigation/investigation.module.css";
import { verifyBrowsePair } from "@/lib/nisar-browse";
import {
  NO_CAUSE_NOTICE, POLS, QA_LABEL, STUDIES, dataUrl, describeRegion, describeStudyShift, fmtDate, fmtDb, fmtInt, fmtSignedDb,
  parseContext, parseEvidence, parsePreview, parseRegions, qaLabel, qaState,
  type ContextSet, type Evidence, type Pol, type PreviewSet, type Region, type RegionSet, type StudyConfig,
} from "@/lib/investigation";

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; evidence: Evidence; regions: RegionSet; preview: PreviewSet | null; previewNote: string; context: ContextSet | null };

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(dataUrl(path), { signal, credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; text: string; disabled?: boolean }[]; onChange: (v: T) => void }) {
  return <div className={styles.group} role="group" aria-label={label}>
    {options.map((o) => <button key={o.id} type="button" className={styles.seg} aria-pressed={value === o.id} disabled={o.disabled} onClick={() => onChange(o.id)}>{o.text}</button>)}
  </div>;
}

export function NisarPrototype() {
  const [studyId, setStudyId] = useState<StudyConfig["id"]>("everglades");
  const [pol, setPol] = useState<Pol>("HH");
  const study = STUDIES.find((s) => s.id === studyId)!;
  return <main className={styles.page}>
    <a className="skip-link" href="#look">Skip to the radar</a>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/">SAR—Waltz</Link>
      <div className={styles.controls}>
        <Seg label="Location" value={studyId} options={STUDIES.map((s) => ({ id: s.id, text: s.short }))} onChange={setStudyId} />
        <Seg label="Polarization" value={pol} options={POLS.map((p) => ({ id: p, text: p }))} onChange={setPol} />
        <span className={styles.qaChip} role="note" title="Not cleared for quantitative analysis"><code>{QA_LABEL}</code></span>
      </div>
      <Link className={styles.demoLink} href="/">Educational lab ↗</Link>
    </header>
    <div className={styles.wrap}><ConnectionStatus /><RadarHero study={study} pol={pol} /><Primer /></div>
    <div className={styles.wrap}><Workbench key={study.id} study={study} pol={pol} /></div>
    <footer className={styles.footer}><span className={styles.footerLinks}><Link href="/">SAR—Waltz home</Link><Link href="/">Educational lab</Link></span><span>SAR—Waltz · NASA Space Apps · Observe carefully. Interpret cautiously.</span><span>AI assistance was used for interface design and code. The published radar measurements were preserved.</span></footer>
  </main>;
}

function Primer() {
  return <Reveal><section className={styles.primer} aria-labelledby="primer-title">
    <p className={styles.eyebrow}>New to radar? Start here</p><h2 id="primer-title">Read the return.</h2>
    <div className={styles.cards}>
      <div className={styles.card}><h3>Backscatter</h3><p>NISAR sends microwave pulses down and records how much returns. It sees through cloud and at night. Bright means a strong return, dark a weak one. It is not a photograph.</p></div>
      <div className={styles.card}><h3>Decibels</h3><p>Backscatter is measured on a log scale. Every −10 dB is ten times less power; about 3 dB is a doubling or halving. A number alone does not establish significance.</p></div>
      <div className={styles.card}><h3>HH and HV</h3><p>Two ways of sending and receiving the radar wave. HV is much weaker and responds differently to the surface. Compare each with itself across dates.</p></div>
      <div className={styles.card}><h3>Change is not cause</h3><p>Roughness, moisture, vegetation structure, noise and processing all alter backscatter. A difference between dates does not say which one happened.</p></div>
    </div>
  </section></Reveal>;
}

function Workbench({ study, pol }: { study: StudyConfig; pol: Pol }) {
  const [data, setData] = useState<Loaded>({ status: "loading" });
  const [mode, setMode] = useState<ViewMode>("swipe");
  const [selected, setSelected] = useState("all");
  const [resetSignal] = useState(0);
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
        let preview: PreviewSet | null = null, previewNote = "", context: ContextSet | null = null;
        if (study.previewDir) {
          try { preview = parsePreview(await getJson(`${study.previewDir}/preview-manifest.json`, ac.signal), study); }
          catch { previewNote = "Single-date radar previews could not be loaded or validated, so only the exploratory difference map is shown."; }
        } else previewNote = `Single-date radar previews have not been published for ${study.label}. Showing the exploratory difference map, histograms and statistics.`;
        // Context photographs are optional; failure never affects the radar evidence.
        if (study.contextDir) { try { context = parseContext(await getJson(`${study.contextDir}/context.json`, ac.signal)); } catch { context = null; } }
        if (!ac.signal.aborted) setData({ status: "ready", evidence, regions, preview, previewNote, context });
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
      setGibsNote(ok ? "NASA GIBS browse mosaic is shown faintly as coarse context." : "NASA GIBS coverage for both dates could not be confirmed, so the context layer is off.");
    }).catch(() => { if (!ac.signal.aborted) setGibsNote("NASA GIBS context is unreachable right now. The radar does not depend on it."); });
    return () => ac.abort();
  }, [study]);

  const onGibsFail = useCallback(() => { setGibsReady(false); setGibsNote("NASA GIBS tiles failed to load; the context layer is off. The radar is unaffected."); }, []);

  if (data.status === "loading") return <div className={styles.section}><div className={styles.mapSkeleton} role="status">Loading published evidence for {study.label}…</div></div>;
  if (data.status === "error") return <div className={styles.section}><p role="alert" className={`${styles.notice} ${styles.error}`}>{data.message}</p></div>;
  const { evidence, regions, preview, previewNote, context } = data;
  const effectiveMode: ViewMode = preview ? mode : "difference";
  const region = regions.regions.find((r) => r.id === selected) ?? null;
  const pe = evidence.pols[pol];
  const n = (k: number) => String(k).padStart(2, "0");
  let step = 0;

  return <>
    <section className={styles.section} id="look" aria-labelledby="h-look">
      <header><p className={styles.eyebrow}>{n(++step)} / Look</p><h2 id="h-look">{study.label}</h2>
        <p className={styles.lead}>{fmtDate(study.dates[0])} and {fmtDate(study.dates[1])}, polarization {pol}. {preview ? "Drag the divider to compare dates. Pick a region to zoom in." : "Pick a region to zoom in."}</p></header>
      <p className={styles.qaLine} role="note"><strong>{QA_LABEL}</strong><span>{NO_CAUSE_NOTICE} Official quality checks are not cleared (see Verify).</span></p>
      {previewNote && <p className={styles.notice} role="note" style={{ marginBottom: 16 }}>{previewNote}</p>}
      <div className={styles.viewer} data-workbench>
        <div>
          <div className={styles.viewTools}>
            <Seg label="View" value={effectiveMode} onChange={setMode} options={[
              { id: "swipe", text: "Swipe", disabled: !preview }, { id: "side", text: "Side by side", disabled: !preview }, { id: "difference", text: "Difference" }]} />
            {study.gibsContext && <label className={styles.check}><input type="checkbox" checked={gibsReady && gibsVisible} disabled={!gibsReady} onChange={(e) => setGibsVisible(e.target.checked)} /> NASA GIBS context</label>}
          </div>
          {problem && <p role="alert" className={`${styles.notice} ${styles.error}`} style={{ marginBottom: 12 }}>{problem}</p>}
          <MapGate study={study} regions={regions} preview={preview} pol={pol} mode={effectiveMode} selectedId={selected} onSelect={setSelected}
            gibsReady={gibsReady} gibsVisible={gibsVisible} onGibsFail={onGibsFail} onProblem={setProblem} onAfterMap={setAfterMap} resetSignal={resetSignal} />
          <Legend mode={effectiveMode} pol={pol} preview={preview} regions={regions} />
          <p className={`${styles.small} ${styles.muted}`} style={{ marginTop: 10 }}>Pixels are drawn as published (nearest-neighbour; no smoothing, sharpening or enhancement); one pixel is about 10 m. {gibsNote}</p>
        </div>
        <aside className={styles.inspector} aria-labelledby="h-region">
          <h2 id="h-region">Inspect a region</h2>
          <div className={styles.chips} role="group" aria-label="Investigation region">
            <button type="button" className={styles.chip} aria-pressed={selected === "all"} onClick={() => setSelected("all")}>All</button>
            {regions.regions.map((r) => <button key={r.id} type="button" className={styles.chip} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>Region {r.id}</button>)}
          </div>
          {region ? <RegionDetail region={region} pol={pol} dates={study.dates} regions={regions} /> :
            <div className={styles.detail}><p>{describeStudyShift(pol, pe, study.dates)}</p>
              <p>Regions A, B and C come from an exploratory search for pixel-level differences, so they illustrate variation rather than typical conditions.</p></div>}
        </aside>
      </div>
    </section>

    <section className={styles.section} id="compare" aria-labelledby="h-scene">
      <header><p className={styles.eyebrow}>{n(++step)} / Compare</p><h2 id="h-scene">The whole scene, {pol}</h2>
        <p className={styles.lead}>How many pixels fall at each backscatter level, on each date.</p></header>
      <div className={styles.twoCol}>
        <div>
          <Histogram pol={pol} ev={pe} dates={study.dates} />
          <p className={`${styles.small} ${styles.muted}`}>Each line counts screened pixels per 0.52 dB bin. {fmtInt(pe.observations[0].outsideDisplayRange)} and {fmtInt(pe.observations[1].outsideDisplayRange)} pixels fall outside the fixed display range and are not in the bins.</p>
          <details className={styles.more}><summary>Original analysis figure and bin counts</summary>
            {/* eslint-disable-next-line @next/next/no-img-element -- static export; analysis figure is shown exactly as published */}
            <img className={styles.figure} src={dataUrl(`${study.evidenceDir}/${pe.histogramImage}`)} alt={`${pol} backscatter histogram comparing ${fmtDate(study.dates[0])} and ${fmtDate(study.dates[1])}, as published with the evidence package.`} loading="lazy" />
            <div className={styles.tableScroll}><table className={styles.table}><caption>Pixels per bin ({pol})</caption>
              <thead><tr><th scope="col">Bin (dB)</th><th scope="col">{fmtDate(study.dates[0])}</th><th scope="col">{fmtDate(study.dates[1])}</th></tr></thead>
              <tbody>{pe.bins.map((b) => <tr key={b.lowDb}><th scope="row">{b.lowDb.toFixed(2).replace("-", "−")} to {b.highDb.toFixed(2).replace("-", "−")}</th><td>{fmtInt(b.counts[0])}</td><td>{fmtInt(b.counts[1])}</td></tr>)}</tbody></table></div>
          </details>
        </div>
        <div className={styles.stack}>
          <div className={styles.tableScroll}><table className={styles.table}>
            <caption>{pol} backscatter, gamma-0 in dB</caption>
            <thead><tr><th scope="col">Statistic</th><th scope="col">{fmtDate(study.dates[0])}</th><th scope="col">{fmtDate(study.dates[1])}</th><th scope="col">Later − earlier*</th></tr></thead>
            <tbody>
              <tr className={styles.key}><th scope="row">Median</th><td>{fmtDb(pe.observations[0].medianDb)}</td><td>{fmtDb(pe.observations[1].medianDb)}</td><td>{fmtSignedDb(pe.differenceOfRegionalMediansDb)}</td></tr>
              <tr className={styles.key}><th scope="row">Mean</th><td>{fmtDb(pe.observations[0].meanDb)}</td><td>{fmtDb(pe.observations[1].meanDb)}</td><td>{fmtSignedDb(pe.differenceOfRegionalMeansDb)}</td></tr>
              <tr><th scope="row">5th percentile</th><td>{fmtDb(pe.observations[0].p05Db)}</td><td>{fmtDb(pe.observations[1].p05Db)}</td><td /></tr>
              <tr><th scope="row">95th percentile</th><td>{fmtDb(pe.observations[0].p95Db)}</td><td>{fmtDb(pe.observations[1].p95Db)}</td><td /></tr>
              <tr><th scope="row">Standard deviation</th><td>{fmtDb(pe.observations[0].stdDb)}</td><td>{fmtDb(pe.observations[1].stdDb)}</td><td /></tr>
              <tr><th scope="row">Screened pixels</th><td>{fmtInt(pe.observations[0].count)}</td><td>{fmtInt(pe.observations[1].count)}</td><td /></tr>
            </tbody></table></div>
          <p className={`${styles.small} ${styles.muted}`}>*A difference of two separate regional summaries. It is not a per-pixel change, and the two dates may not retain exactly the same pixels.</p>
          <p className={styles.muted}>{describeStudyShift(pol, pe, study.dates)}</p>
        </div>
      </div>
    </section>

    {context && <ContextPhotos study={study} context={context} index={n(++step)} />}

    <TrustSection study={study} evidence={evidence} regions={regions} preview={preview} index={n(++step)} />

    <details className={styles.more} style={{ marginTop: 48 }}>
      <summary>Processed GCOV products (advanced)</summary>
      <div className={styles.products}><ProcessedOverlayPanel map={afterMap} onDisplay={setProcessedLabel} />{processedLabel && <p role="status">Showing: {processedLabel}</p>}</div>
    </details>
  </>;
}

function Legend({ mode, pol, preview, regions }: { mode: ViewMode; pol: Pol; preview: PreviewSet | null; regions: RegionSet }) {
  if (mode === "difference") {
    const [lo, hi] = regions.limitsDb;
    // This ramp reproduces the colours encoded in the published difference PNGs, so it is data, not decoration.
    return <div className={styles.legend}><div>{pol} difference, later minus earlier, per pixel, clipped at ±{hi} dB. Colours are not a flood or damage map.</div>
      <div className={styles.ramp} style={{ background: "linear-gradient(90deg,#1010ff,#f4f0ff 50%,#ff1010)" }} role="img" aria-label={`Blue is negative, near-white is zero, red is positive, clipped at ${lo} and ${hi} dB`} />
      <div className={styles.rampLabels}><span>{fmtSignedDb(lo, 0)} (lower later)</span><span>0</span><span>{fmtSignedDb(hi, 0)} (higher later)</span></div></div>;
  }
  const range = preview?.acquisitions[0].images[pol].displayRangeDb;
  if (!range) return null;
  return <div className={styles.legend}><div>{pol} backscatter, gamma-0. Same display scale on both dates.</div>
    <div className={styles.ramp} style={{ background: "linear-gradient(90deg,#000,#fff)" }} role="img" aria-label={`Black is ${range[0]} dB, white is ${range[1]} dB`} />
    <div className={styles.rampLabels}><span>{fmtDb(range[0], 0)} · weak return</span><span>{fmtDb(range[1], 0)} · strong return</span></div></div>;
}

function RegionDetail({ region, pol, dates, regions }: { region: Region; pol: Pol; dates: StudyConfig["dates"]; regions: RegionSet }) {
  const s = region.stats[pol];
  const other = POLS.find((p) => p !== pol)!;
  return <div className={styles.detail}>
    <div><h3 style={{ fontSize: "1.0625rem" }}>Region {region.id}: {region.title}</h3></div>
    <span className={styles.status}>{regions.scientificStatus}</span>
    <div className={styles.big}>{fmtSignedDb(s.paired.medianDifferenceDb, 3)}<small>median {pol} per-pixel difference · {other} {fmtSignedDb(region.stats[other].paired.medianDifferenceDb, 3)}</small></div>
    <p>{describeRegion(pol, region, dates)}</p>
    <div className={styles.tableScroll}><table className={styles.table}>
      <caption>Region {region.id} · {pol} · {fmtInt(s.paired.pixels)} paired pixels</caption>
      <tbody>
        <tr><th scope="row">Median, {fmtDate(dates[0])}</th><td>{fmtDb(s.beforeMedianDb, 3)}</td></tr>
        <tr><th scope="row">Median, {fmtDate(dates[1])}</th><td>{fmtDb(s.afterMedianDb, 3)}</td></tr>
        <tr className={styles.key}><th scope="row">Median of differences</th><td>{fmtSignedDb(s.paired.medianDifferenceDb, 3)}</td></tr>
        <tr><th scope="row">Mean of differences</th><td>{fmtSignedDb(s.paired.meanDifferenceDb, 3)}</td></tr>
        <tr><th scope="row">5th to 95th percentile</th><td>{fmtSignedDb(s.paired.p05DifferenceDb, 2)} to {fmtSignedDb(s.paired.p95DifferenceDb, 2)}</td></tr>
      </tbody></table></div>
    <p className={styles.small}>The median of differences is computed pixel by pixel; it is not the same as subtracting the two medians.</p>
    {region.interpretation && <p className={styles.small}>{region.interpretation}</p>}
    <p className={`${styles.small} ${styles.muted}`}>Selection: {region.selectionMethod}. Not independently validated.</p>
  </div>;
}

function ContextPhotos({ study, context, index }: { study: StudyConfig; context: ContextSet; index: string }) {
  return <section className={styles.section} id="context" aria-labelledby="h-context">
    <header><p className={styles.eyebrow}>{index} / Context</p><h2 id="h-context">{context.sectionTitle}</h2><p className={styles.lead}>{context.notice}</p></header>
    <ul className={styles.photos}>{context.photos.map((p) => <li key={p.imageFile}><figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export; sourced photograph */}
      <img src={dataUrl(`${study.contextDir}/${p.imageFile}`)} alt={`${p.title}. ${p.caption} Photograph, not a radar image.`} loading="lazy" />
      <figcaption><strong>{p.title}</strong>{fmtDate(p.date)} · {p.caption}<br />{p.credit} · <a href={p.sourceUrl} rel="noopener noreferrer">Source</a><br />{p.rights}. {p.usage}.</figcaption></figure></li>)}</ul>
  </section>;
}

function TrustSection({ study, evidence, regions, preview, index }: { study: StudyConfig; evidence: Evidence; regions: RegionSet; preview: PreviewSet | null; index: string }) {
  return <section className={styles.section} id="verify" aria-labelledby="h-trust">
    <header><p className={styles.eyebrow}>{index} / Verify</p><h2 id="h-trust">What we can say.<br />And cannot.</h2>
      <p className={styles.lead}>The observations are real; their interpretation is open. Failed and unverified checks stay visible. This is a status report, not a confidence score.</p></header>
    <div className={styles.twoCol}>
      <div className={styles.stack}>
        <div className={styles.tableScroll}><table className={`${styles.table} ${styles.qaTable}`}><caption>Quality checks for {study.label} · {evidence.scientificClearance}</caption><thead><tr><th scope="col">Check</th><th scope="col">Status and evidence</th></tr></thead><tbody>{evidence.quality.map(([key, text]) => { const state = qaState(text);
          return <tr key={key}><th scope="row">{qaLabel(key)}</th><td><span className={`${styles.qaIcon} ${styles[`qa_${state}`]}`}>{state.toUpperCase()}</span><p>{text}</p></td></tr>; })}</tbody></table></div>
        <h3>Known limitations</h3>
        <ul className={styles.plain}>{evidence.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className={styles.yesno}>
          <div><h3>What this shows</h3><ul className={styles.plain}><li>Real NISAR HH/HV backscatter on two dates, as histograms and statistics.</li><li>Three candidate regions with measured per-pixel differences, labeled {QA_LABEL}.</li></ul></div>
          <div><h3>What it does not show</h3><ul className={styles.plain}><li>Flooding, vegetation loss, burned area, damage or ground displacement.</li><li>A validated change detection, a confidence score or a prediction.</li></ul></div>
        </div>
      </div>
      <div className={styles.stack}>
        <h3>Data provenance</h3>
        <dl className={styles.dl}>
          <dt>Source</dt><dd>{evidence.provenance}</dd>
          <dt>Measurement</dt><dd>{evidence.measurement}</dd>
          <dt>Acquisitions</dt>
          <dd>{study.dates.map((d, i) => <span key={d}>{i ? <br /> : null}{fmtDate(d)} · <a href={`https://cmr.earthdata.nasa.gov/search/concepts/${study.granules[i]}.html`} rel="noopener noreferrer">{study.granules[i]}</a>{preview ? ` · track ${preview.acquisitions[i].track}, frame ${String(preview.acquisitions[i].frame).padStart(3, "0")}` : ""}</span>)}</dd>
          <dt>Grid</dt><dd>{regions.crs}, {Math.abs(regions.pixelSpacingMeters[0])} m pixels, {regions.nativeShape[1]}×{regions.nativeShape[0]} (columns × rows); {fmtInt(regions.pairedPixels)} paired HH/HV pixels</dd>
          <dt>Difference</dt><dd>{regions.differenceDefinition}</dd>
          {preview && <><dt>Previews</dt><dd>{preview.sourceCollection}. {preview.measurement}. QA: {preview.scientificClearance}.</dd></>}
          <dt>Collection</dt><dd>NISAR_L2_GCOV_PROVISIONAL_V1 · <a href="https://doi.org/10.5067/NIL2GCOV-P1" rel="noopener noreferrer">Dataset DOI</a></dd>
        </dl>
        {study.gibsContext && <p className={`${styles.small} ${styles.muted}`}>We acknowledge the use of imagery from the NASA Global Imagery Browse Services (GIBS), part of NASA&apos;s Earth Science Data and Information System (ESDIS). GIBS mosaics may combine products and are not pixel-level lineage.</p>}
        <p className={styles.small}><a href="https://hyp3-docs.asf.alaska.edu/nisar-docs/worldview/" rel="noopener noreferrer">ASF imagery guide</a> · <a href="https://nisar-docs.asf.alaska.edu/provisional-known-issues/" rel="noopener noreferrer">Provisional-data limitations</a> · <a href="https://nasa-gibs.github.io/gibs-api-docs/" rel="noopener noreferrer">NASA GIBS</a></p>
      </div>
    </div>
  </section>;
}
