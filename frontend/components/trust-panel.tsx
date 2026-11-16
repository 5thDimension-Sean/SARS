"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  alternativeExplanations, analyzeBox, boxAreaKm2, boxProblem, buildReadiness, buildTrustReport, countSelectionCandidates,
  decodeGrid, expectedChanceHits, parseGridMeta, reportFilename, sameBox, signedDb as signed, BACKGROUND_RATE_THRESHOLD,
  type Box, type BoxAnalysis, type BoxRefusal, type DiffGrid, type GridMeta, type Polarization,
} from "@/lib/trust-metrics";
import { DEFAULT_LOCATION, findLocation, TRUST_LOCATIONS, type GridStudy, type TrustLocation } from "@/lib/trust-studies";
import styles from "./trust-panel.module.css";

const POLS: Polarization[] = ["HH", "HV"];

// Every published preset region was picked by ranking candidate windows on its own measured difference, so
// none may count as a pre-specified test. Only a box the visitor draws that differs from the presets does.
interface Region { id: string; title: string; box: Box }
interface Evidence { quality: Record<string, string>; limitations: string[]; provenance?: string }
interface Loaded {
  study: GridStudy; base: string; evidence: Evidence; regions: Region[]; regionsWarning: string;
  granules: [string, string]; dates: [string, string]; nativeShape: [number, number];
  meta: GridMeta | null; grids: Record<Polarization, DiffGrid> | null; candidates: number | null; problem: string;
}
type LoadState =
  | { id: string; status: "loading" }
  | { id: string; status: "unpublished" }
  | { id: string; status: "error"; message: string }
  | { id: string; status: "ready"; data: Loaded };
type Checked = { key: string; box: Box; label: string; analyses: Record<Polarization, BoxAnalysis | BoxRefusal>; selectedFromData: boolean };
type Draft = { r0: string; r1: string; c0: string; c1: string };

async function getJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  const response = await fetch(url, { signal, credentials: "omit", redirect: "error" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function toRegion(value: unknown): Region {
  const r = value as { id?: unknown; title?: unknown; rowRange?: unknown; columnRange?: unknown };
  const rows = r.rowRange as number[], cols = r.columnRange as number[];
  if (typeof r.id !== "string" || typeof r.title !== "string" || !Array.isArray(rows) || !Array.isArray(cols) || rows.length !== 2 || cols.length !== 2) throw new Error("Invalid region metadata");
  return { id: r.id, title: r.title, box: { r0: rows[0], r1: rows[1], c0: cols[0], c1: cols[1] } };
}

async function loadStudy(study: GridStudy, signal: AbortSignal): Promise<Loaded | null> {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/trust(?:\.html)?\/?$/, "/data/"); url.search = ""; url.hash = "";
  const base = url.href;
  const [evidenceJson, regionsJson] = await Promise.all([
    getJson(`${base}${study.evidenceDir}/evidence.json`, signal), getJson(`${base}${study.regionsDir}/regions.json`, signal),
  ]);
  if (!evidenceJson || !regionsJson) return null; // location not published: truthful empty state
  const ev = evidenceJson as { quality?: Record<string, string>; limitations?: string[]; provenance?: string };
  const rg = regionsJson as { regions?: unknown[]; warning?: string; sourceGranules?: [string, string]; dates?: [string, string]; nativeShape?: [number, number] };
  if (!ev.quality || !rg.regions || !rg.sourceGranules || !rg.dates || !rg.nativeShape) throw new Error("Published study metadata is incomplete.");
  const data: Loaded = {
    study, base, evidence: { quality: ev.quality, limitations: ev.limitations ?? [], provenance: typeof ev.provenance === "string" ? ev.provenance : undefined },
    regions: rg.regions.map(toRegion), regionsWarning: rg.warning ?? "", granules: rg.sourceGranules, dates: rg.dates,
    nativeShape: rg.nativeShape, meta: null, grids: null, candidates: null, problem: "",
  };
  try {
    const metaJson = await getJson(`${base}${study.regionsDir}/difference-grid.json`, signal);
    if (!metaJson) return data; // grid not exported yet: readiness only
    const meta = parseGridMeta(metaJson);
    if (meta.shape[0] !== data.nativeShape[0] || meta.shape[1] !== data.nativeShape[1]) throw new Error("Grid shape does not match the study's analysis grid.");
    if (meta.sourceGranules.join() !== data.granules.join() || meta.dates.join() !== data.dates.join()) throw new Error("Grid acquisitions do not match the study metadata.");
    const grids = {} as Record<Polarization, DiffGrid>;
    for (const pol of POLS) {
      const response = await fetch(`${base}${study.regionsDir}/${meta.files[pol]}`, { signal, credentials: "omit", redirect: "error" });
      if (!response.ok) throw new Error(`${pol} grid could not be loaded.`);
      grids[pol] = decodeGrid(await response.arrayBuffer(), meta);
    }
    const candidates = study.selection ? countSelectionCandidates(grids.HH, study.selection.window, study.selection.step) : null;
    return { ...data, meta, grids, candidates };
  } catch (error) {
    if (signal.aborted) throw error;
    return { ...data, problem: error instanceof Error ? error.message : "Numerical grid could not be validated." };
  }
}

/** The display PNG is a visual aid only. Exact size match is aligned; within 2% is usable but approximate. */
function imageFitFor(width: number, height: number, g: DiffGrid): "exact" | "approximate" | "unusable" {
  if (width === g.cols && height === g.rows) return "exact";
  return Math.abs(width - g.cols) / g.cols <= 0.02 && Math.abs(height - g.rows) / g.rows <= 0.02 ? "approximate" : "unusable";
}
const keyOf = (id: string, b: Box) => `${id}:${b.r0},${b.r1},${b.c0},${b.c1}`;
const toDraft = (b: Box): Draft => ({ r0: String(b.r0), r1: String(b.r1), c0: String(b.c0), c1: String(b.c1) });

const subscribeHash = (notify: () => void) => { window.addEventListener("hashchange", notify); return () => window.removeEventListener("hashchange", notify); };
const readHash = () => decodeURIComponent(window.location.hash.slice(1));

export function TrustPanel() {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const location: TrustLocation = findLocation(hash) ?? findLocation(DEFAULT_LOCATION)!;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ id: location.id, status: "loading" });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [checked, setChecked] = useState<Checked | null>(null);
  const [looks, setLooks] = useState<string[]>([]);
  const [imageFit, setImageFit] = useState<Record<string, "exact" | "approximate" | "unusable">>({});
  const drag = useRef<{ row: number; col: number } | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const gridStudy = location.kind === "grid" ? location : null;

  useEffect(() => {
    if (!gridStudy) return;
    const controller = new AbortController();
    loadStudy(gridStudy, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState(data ? { id: gridStudy.id, status: "ready", data } : { id: gridStudy.id, status: "unpublished" }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setState({ id: gridStudy.id, status: "error", message: error instanceof Error ? error.message : "Could not load study." }); });
    return () => controller.abort();
  }, [gridStudy, attempt]);

  const loadState = gridStudy && state.id === gridStudy.id ? state : null;
  const data = loadState?.status === "ready" ? loadState.data : null;
  const grid = data?.grids?.HH ?? null;
  const firstRegion = data?.regions[0];
  const stored = drafts[location.id];
  const draft: Draft = useMemo(() => stored ?? (firstRegion ? toDraft(firstRegion.box) : { r0: "", r1: "", c0: "", c1: "" }), [stored, firstRegion]);
  const box: Box | null = useMemo(() => {
    const n = [draft.r0, draft.r1, draft.c0, draft.c1].map((v) => (v.trim() === "" ? NaN : Number(v)));
    return n.some((v) => Number.isNaN(v)) ? null : { r0: n[0], r1: n[1], c0: n[2], c1: n[3] };
  }, [draft]);
  const preset = data && box ? data.regions.find((r) => sameBox(r.box, box)) ?? null : null;
  const problem = !box ? "Enter all four edges as numbers." : grid ? boxProblem(grid, box) : null;
  const currentCheck = checked && box && checked.key === keyOf(location.id, box) ? checked : null;
  const spacing = data?.meta?.pixelSpacingMeters ?? null;
  const studyLooks = looks.filter((k) => k.startsWith(`${location.id}:`));

  const setDraft = (next: Draft) => setDrafts((d) => ({ ...d, [location.id]: next }));
  const chooseLocation = (id: string) => { window.location.hash = id; };
  const edit = (key: keyof Draft, value: string) => setDraft({ ...draft, [key]: value });

  const check = () => {
    if (!data?.grids || !box || problem) return;
    const key = keyOf(location.id, box);
    const analyses = { HH: analyzeBox(data.grids.HH, box), HV: analyzeBox(data.grids.HV, box) };
    setChecked({ key, box, label: preset ? `Region ${preset.id}` : "Custom box", analyses, selectedFromData: !!preset });
    setLooks((previous) => (previous.includes(key) ? previous : [...previous, key]));
  };

  const readiness = useMemo(() => {
    if (location.kind === "none") return buildReadiness({ quality: {}, gridLoaded: false, selectedAsExtreme: false, independentEvidence: location.independent, noNisarProduct: true });
    if (!data) return null;
    return buildReadiness({
      quality: data.evidence.quality, regionsWarning: data.regionsWarning, gridLoaded: !!data.grids,
      hh: currentCheck?.analyses.HH, hv: currentCheck?.analyses.HV, selectedAsExtreme: !!currentCheck?.selectedFromData,
      candidateWindows: data.candidates ?? undefined, independentEvidence: [],
    });
  }, [location, data, currentCheck]);
  const explanations = useMemo(() => alternativeExplanations(!!currentCheck?.analyses.HH.ok), [currentCheck]);

  const download = useCallback(() => {
    if (!data || !currentCheck || !readiness) return;
    const html = buildTrustReport({
      study: data.study.label, boxLabel: currentCheck.label, box: currentCheck.box, dates: data.dates, granules: data.granules,
      analyses: currentCheck.analyses, readiness, explanations, selectedAsExtreme: currentCheck.selectedFromData,
      candidateWindows: data.candidates ?? undefined, looks: studyLooks.length, pixelSpacingM: spacing ?? undefined,
      limitations: data.evidence.limitations, warning: data.meta?.warning ?? data.regionsWarning, generatedAt: new Date().toISOString(),
    });
    const href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = href; a.download = reportFilename(data.study.id, currentCheck.label);
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }, [data, currentCheck, readiness, explanations, studyLooks.length, spacing]);

  const pointToCell = (event: React.PointerEvent) => {
    const rect = picker.current?.getBoundingClientRect();
    if (!rect || !grid) return null;
    const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * grid.cols)));
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * grid.rows)));
    return { row, col };
  };
  const dragTo = (cell: { row: number; col: number }) => {
    const s = drag.current; if (!s) return;
    setDraft({ r0: String(Math.min(s.row, cell.row)), r1: String(Math.max(s.row, cell.row) + 1), c0: String(Math.min(s.col, cell.col)), c1: String(Math.max(s.col, cell.col) + 1) });
  };

  const loading = gridStudy && (!loadState || loadState.status === "loading");
  const hasGrid = !!data?.grids;
  // Numbering follows what is on screen: no box step for locations without a NISAR pair, no statistics step without a grid.
  const section = (n: number) => (location.kind === "none" ? n - 2 : hasGrid ? n : n - 1);

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div><h1>Is this radar change real?</h1></div>
    </header>
    <p className={styles.lead}>An <strong>evidence checklist</strong>, not a confidence score.</p>

    <div className={styles.studies}>
      <label htmlFor="trust-location">Location</label>
      <select id="trust-location" value={location.id} onChange={(e) => chooseLocation(e.target.value)}>
        {TRUST_LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.label}{l.kind === "none" ? " (no NISAR pair)" : ""}</option>)}
      </select>
    </div>

    {loading && <p role="status">Loading study evidence…</p>}
    {loadState?.status === "error" && <div role="alert" className={styles.empty}><p>{loadState.message}</p><button type="button" onClick={() => { setState({ id: location.id, status: "loading" }); setAttempt((n) => n + 1); }}>Retry</button></div>}
    {loadState?.status === "unpublished" && <div role="status" className={styles.empty}>
      <p><strong>No NISAR comparison has been published for {location.label} yet.</strong></p>
      <p>{location.id === "custom" ? "A custom coordinate has no processed grid on this static site. When the offline pipeline has processed one, its evidence and numerical grid appear here." : "Evidence files for this study are not published, so there is nothing to test."} No metrics are shown and none are estimated.</p>
    </div>}
    {location.kind === "none" && <div role="status" className={styles.empty}>
      <p><strong>No numerical radar comparison exists for {location.label}.</strong></p><p>{location.reason}</p>
      <p>Every radar condition below stays visible as not provided. Nothing is estimated from images.</p>
    </div>}

    {data && <section aria-labelledby="provenance" className={styles.card}>
      <h2 id="provenance">Source and status</h2>
      <p>{data.study.label}. {data.evidence.provenance ?? "NASA NISAR L2 GCOV via ASF DAAC"}. Before {data.dates[0]} ({data.granules[0]}), after {data.dates[1]} ({data.granules[1]}).</p>
      <p className={styles.warning}>{data.meta?.warning ?? (data.regionsWarning || "Exploratory; not cleared for quantitative analysis.")}</p>
    </section>}

    {data && <section aria-labelledby="box" className={styles.card}>
      <h2 id="box">1 · Choose a box to check</h2>
      {!data.grids ? <div className={styles.empty} role="status">
        <p><strong>{data.problem ? "The numerical difference grid could not be used." : "No numerical difference grid is published for this study yet."}</strong> {data.problem}</p>
        <p>Measured statistics, background context and custom boxes are unavailable. Colors in the exploratory difference images are never converted into numbers. The offline pipeline writes the grid when the study is regenerated.</p>
        <div className={styles.figures}>{POLS.map((pol) => <figure key={pol}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${data.base}${data.study.regionsDir}/${pol}_difference_exploratory.png`} alt={`Exploratory ${pol} difference image between ${data.dates[0]} and ${data.dates[1]}. Display only; colors are not measurements.`}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <figcaption>{pol} · {data.dates[0]} to {data.dates[1]} · exploratory, display only</figcaption>
        </figure>)}</div>
      </div> : <>
        <p>Drag on the image or pick a preset. Numbers come from the grid, not the picture.</p>
        <details className={styles.hint}><summary>More detail</summary><p className={styles.hint}>Rows count from the north edge; each cell is {Math.abs(spacing![0])} × {Math.abs(spacing![1])} m. Presets were chosen by ranking windows on their own measured change, so they are not an unbiased test. A box you draw is fairer, though many boxes still produce chance hits.</p></details>
        <div className={styles.presets} role="group" aria-label="Preset regions">
          {data.regions.map((r) => <button key={r.id} type="button" aria-pressed={preset?.id === r.id} onClick={() => setDraft(toDraft(r.box))}>Region {r.id}: {r.title}</button>)}
        </div>
        <div className={styles.pickerRow}>
          {imageFit[location.id] !== "unusable" ? <div ref={picker} className={styles.picker} role="group" aria-label="Box picker over an exploratory difference image"
            style={{ aspectRatio: `${grid!.cols} / ${grid!.rows}` }}
            onPointerDown={(e) => { const c = pointToCell(e); if (!c) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = c; dragTo(c); }}
            onPointerMove={(e) => { const c = pointToCell(e); if (c) dragTo(c); }}
            onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${data.base}${data.study.regionsDir}/HH_difference_exploratory.png`} alt="Exploratory HH difference image, display only. Colors are not measurements." draggable={false}
              onError={() => setImageFit((m) => ({ ...m, [location.id]: "unusable" }))}
              onLoad={(e) => { const fit = imageFitFor(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight, grid!); setImageFit((m) => ({ ...m, [location.id]: fit })); }} />
            {box && !problem && <div className={styles.rect} style={{ left: `${box.c0 / grid!.cols * 100}%`, top: `${box.r0 / grid!.rows * 100}%`, width: `${(box.c1 - box.c0) / grid!.cols * 100}%`, height: `${(box.r1 - box.r0) / grid!.rows * 100}%` }} />}
          </div> : <p role="status">The display image is unavailable or does not match the grid closely enough to draw on; use a preset or the numeric edges.</p>}
          <div className={styles.inputs}>
            {imageFit[location.id] === "approximate" && <p className={styles.hint}>The display image differs slightly in size from the grid, so the rectangle is approximate. The pixel edges below are what is measured.</p>}
            {([["r0", "Row start"], ["r1", "Row end"], ["c0", "Column start"], ["c1", "Column end"]] as const).map(([k, text]) =>
              <label key={k}>{text}<input type="number" inputMode="numeric" value={draft[k]} onChange={(e) => edit(k, e.target.value)} aria-invalid={!!problem} /></label>)}
            <p className={styles.hint} role={problem ? "alert" : undefined}>{problem ?? `${box ? (box.r1 - box.r0) * (box.c1 - box.c0) : 0} pixels, about ${box && spacing ? boxAreaKm2(box, spacing).toFixed(2) : 0} km².`}</p>
            <button type="button" className={styles.primary} onClick={check} disabled={!box || !!problem}>Check this box</button>
          </div>
        </div>
      </>}
    </section>}

    {hasGrid && <section aria-labelledby="context" className={styles.card}>
      <h2 id="context">2 · False-alarm context</h2>
      {!currentCheck ? <p role="status">Press “Check this box” to compare it with background windows.</p> : <>
        {currentCheck.selectedFromData && <p className={styles.warning}>{currentCheck.label} was chosen by ranking {data!.candidates ?? "many"} candidate windows on their own measured differences. Standing out is expected by construction, so its rate cannot support a change claim.</p>}
        <div className={styles.tableWrap} role="region" aria-label="Measured statistics, scrolls horizontally" tabIndex={0}><table>
          <caption>{currentCheck.label}: rows {currentCheck.box.r0}–{currentCheck.box.r1}, columns {currentCheck.box.c0}–{currentCheck.box.c1}</caption>
          <thead><tr><th scope="col">Pol.</th><th scope="col">Valid pixels</th><th scope="col">Box median</th><th scope="col">Scene shift</th><th scope="col">Excess</th><th scope="col">Background spread (95%)</th><th scope="col">Background windows at least this far</th></tr></thead>
          <tbody>{POLS.map((pol) => { const a = currentCheck.analyses[pol]; return a.ok
            ? <tr key={pol}><th scope="row">{pol}</th><td>{a.pixels}</td><td>{signed(a.medianDb)} dB</td><td>{signed(a.sceneShiftDb)} dB</td><td>{signed(a.excessDb)} dB</td><td>±{a.backgroundSpreadDb.toFixed(2)} dB</td>
              <td>{(a.exceedanceRate * 100).toFixed(1)}% of {a.referenceWindows}{!currentCheck.selectedFromData && a.exceedanceRate <= BACKGROUND_RATE_THRESHOLD ? " (unusual)" : ""}</td></tr>
            : <tr key={pol}><th scope="row">{pol}</th><td colSpan={6}>Refused: {a.reason}</td></tr>; })}</tbody>
        </table></div>
        <details className={styles.hint}><summary>How to read this</summary><p className={styles.hint}>Background windows are same-size boxes elsewhere in this scene. “Scene shift” is their median change; “excess” is how far this box sits beyond it. A low rate means the box is unusual within its own scene, not that a physical change occurred. It does not remove scene-wide calibration or moisture effects.</p></details>
        {studyLooks.length > 1 && <p className={styles.hint}>You have checked {studyLooks.length} boxes here. At a {BACKGROUND_RATE_THRESHOLD * 100}% rate, about {expectedChanceHits(studyLooks.length).toFixed(1)} would look unusual by chance. These rates are not corrected for repeated looks.</p>}
      </>}
    </section>}

    {readiness && <section aria-labelledby="ready" className={styles.card}>
      <h2 id="ready">{section(3)} · Evidence readiness: {readiness.met} of {readiness.total} conditions met</h2>
      <p className={styles.hint}>Failed and missing conditions stay visible.</p>
      <ul className={styles.conditions}>{readiness.conditions.map((c) => <li key={c.id} data-status={c.status}>
        <span className={styles.badge}>{c.status === "NOT_PROVIDED" ? "NOT PROVIDED" : c.status}</span> <strong>{c.label}</strong><br /><small>{c.detail}</small></li>)}</ul>
    </section>}

    {readiness && <section aria-labelledby="alt" className={styles.card}>
      <h2 id="alt">{section(4)} · Other explanations</h2>
      <p className={styles.hint}>Unranked; open until independent evidence is supplied.</p>
      <ul className={styles.conditions}>{explanations.map((e) => <li key={e.id}><span className={styles.badge}>{e.assessment === "NOT_ASSESSED" ? "NOT ASSESSED" : "PARTLY CHARACTERISED"}</span> <strong>{e.label}</strong><br /><small>What would help: {e.wouldHelp}</small></li>)}</ul>
    </section>}

    {data && <section aria-labelledby="report" className={styles.card}>
      <h2 id="report">Evidence report</h2>
      <p>Printable HTML with provenance and limitations. {currentCheck ? "" : "Check a box first."}</p>
      <button type="button" className={styles.primary} onClick={download} disabled={!currentCheck}>Download report for {currentCheck?.label ?? "a checked box"}</button>
    </section>}

    {data && <details className={styles.card}><summary>Limitations of this study</summary>
      <ul>{data.evidence.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>}
  </main>;
}
