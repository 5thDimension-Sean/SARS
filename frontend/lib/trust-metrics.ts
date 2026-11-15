// Trust layer: evidence readiness, background false-alarm context and report text.
//
// Scientific contract (see AGENTS.md):
//  * Nothing here is a probability of flooding, damage or any physical cause, and
//    nothing is a "scientific confidence" score. Failed conditions stay visible.
//  * Every number comes from a numerical paired dB-difference grid, never from the
//    colors of a displayed PNG.
//  * Regions picked as the most extreme windows cannot use their own exceedance
//    rate as evidence; the selection itself is the explanation.

export type Box = { r0: number; r1: number; c0: number; c1: number }; // half-open [r0,r1) x [c0,c1)
export type Status = "PASS" | "FAIL" | "UNVERIFIED" | "NOT_PROVIDED";
export type Polarization = "HH" | "HV";

export const MIN_BOX_PIXELS = 400;
export const MIN_VALID_FRACTION = 0.9;
export const MIN_REFERENCE_WINDOWS = 30;
export const MAX_REFERENCE_WINDOWS = 4000;
export const BACKGROUND_RATE_THRESHOLD = 0.05;
export const SELECTION_WINDOW = 80; // matches build_*_regions.py select_boxes
export const SELECTION_STEP = 40;

export interface DiffGrid { rows: number; cols: number; data: Float32Array } // NaN marks no valid pair

export interface GridMeta {
  schemaVersion: "sar-waltz-difference-grid-1.0";
  study: string; dates: [string, string]; sourceGranules: [string, string];
  scaleDb: number; nodata: number; shape: [number, number]; pixelSpacingMeters: [number, number];
  files: Record<Polarization, string>; warning: string; crs: string;
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 2000;

export function parseGridMeta(value: unknown): GridMeta {
  const m = value as Record<string, unknown> | null;
  if (!m || typeof m !== "object") throw new Error("Missing grid metadata");
  if (m.schemaVersion !== "sar-waltz-difference-grid-1.0") throw new Error("Unsupported grid schema");
  if (m.dtype !== "int16" || m.byteOrder !== "little" || m.rowOrder !== "north-up") throw new Error("Unsupported grid encoding");
  if (typeof m.scaleDb !== "number" || !(m.scaleDb > 0) || m.nodata !== -32768) throw new Error("Invalid grid scale or nodata");
  const shape = m.shape as unknown;
  if (!Array.isArray(shape) || shape.length !== 2 || !shape.every((n) => Number.isInteger(n) && n > 0 && n <= 8192)) throw new Error("Invalid grid shape");
  const dates = m.dates as unknown, granules = m.sourceGranules as unknown;
  if (!Array.isArray(dates) || dates.length !== 2 || !dates.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error("Invalid grid dates");
  if (dates[0] === dates[1]) throw new Error("Grid dates must differ");
  if (!Array.isArray(granules) || granules.length !== 2 || !granules.every((g) => typeof g === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{2,199}$/.test(g))) throw new Error("Invalid grid granules");
  const files = m.files as Record<string, unknown> | undefined;
  if (!files || !(["HH", "HV"] as const).every((p) => typeof files[p] === "string" && /^[A-Za-z0-9_]+\.i16$/.test(files[p] as string))) throw new Error("Invalid grid file names");
  const sp = m.pixelSpacingMeters as unknown;
  if (!Array.isArray(sp) || sp.length !== 2 || !sp.every((n) => typeof n === "number" && Number.isFinite(n) && n !== 0)) throw new Error("Invalid pixel spacing");
  if (!isText(m.warning) || !isText(m.crs) || !isText(m.study)) throw new Error("Missing grid caveats");
  return m as unknown as GridMeta;
}

export function decodeGrid(buffer: ArrayBuffer, meta: GridMeta): DiffGrid {
  const [rows, cols] = meta.shape;
  if (buffer.byteLength !== rows * cols * 2) throw new Error("Grid size does not match its metadata");
  const view = new DataView(buffer);
  const data = new Float32Array(rows * cols);
  for (let i = 0; i < data.length; i++) {
    const raw = view.getInt16(i * 2, true);
    data[i] = raw === meta.nodata ? NaN : raw * meta.scaleDb;
  }
  return { rows, cols, data };
}

export function boxProblem(grid: DiffGrid, box: Box): string | null {
  const ints = [box.r0, box.r1, box.c0, box.c1];
  if (!ints.every(Number.isInteger)) return "Box edges must be whole pixel numbers.";
  if (box.r0 < 0 || box.c0 < 0 || box.r1 > grid.rows || box.c1 > grid.cols) return `Box must stay inside the ${grid.rows}×${grid.cols} grid.`;
  if (box.r1 <= box.r0 || box.c1 <= box.c0) return "Box end must be after its start.";
  if ((box.r1 - box.r0) * (box.c1 - box.c0) < MIN_BOX_PIXELS) return `Box must contain at least ${MIN_BOX_PIXELS} pixels (for example 20×20); smaller boxes are dominated by speckle.`;
  return null;
}

function percentile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 1) return sorted[0];
  const x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
}
const medianSorted = (sorted: ArrayLike<number>) => percentile(sorted, 0.5);

function boxValues(grid: DiffGrid, box: Box): Float32Array {
  const out = new Float32Array((box.r1 - box.r0) * (box.c1 - box.c0));
  let n = 0;
  for (let r = box.r0; r < box.r1; r++) {
    const base = r * grid.cols;
    for (let c = box.c0; c < box.c1; c++) { const v = grid.data[base + c]; if (v === v) out[n++] = v; }
  }
  return out.subarray(0, n);
}

/** Medians of every h×w window with enough valid pixels, skipping windows that touch `exclude`. */
export function windowMedians(grid: DiffGrid, h: number, w: number, step: number, exclude?: Box): number[] {
  const out: number[] = [];
  const scratch = new Float32Array(h * w);
  for (let r = 0; r + h <= grid.rows; r += step) {
    for (let c = 0; c + w <= grid.cols; c += step) {
      if (exclude && r < exclude.r1 && r + h > exclude.r0 && c < exclude.c1 && c + w > exclude.c0) continue;
      let n = 0;
      for (let i = 0; i < h; i++) {
        const base = (r + i) * grid.cols + c;
        for (let j = 0; j < w; j++) { const v = grid.data[base + j]; if (v === v) scratch[n++] = v; }
      }
      if (n < MIN_VALID_FRACTION * h * w) continue;
      const s = scratch.subarray(0, n);
      s.sort();
      out.push(medianSorted(s));
    }
  }
  return out;
}

/** Number of candidate windows the region-selection step searched, for the study's published tile size and step. */
export function countSelectionCandidates(grid: DiffGrid, window = SELECTION_WINDOW, step = SELECTION_STEP): number {
  return windowMedians(grid, window, window, step).length;
}

/** Ground area of a pixel box in km², from the grid's published pixel spacing in metres. */
export function boxAreaKm2(box: Box, spacingM: [number, number]): number {
  return (box.r1 - box.r0) * (box.c1 - box.c0) * Math.abs(spacingM[0] * spacingM[1]) / 1e6;
}

export interface BoxAnalysis {
  ok: true; pixels: number; validFraction: number;
  medianDb: number; meanDb: number; p05Db: number; p95Db: number;
  referenceWindows: number; sceneShiftDb: number; excessDb: number;
  backgroundSpreadDb: number; // 95% of background windows differ from the scene shift by no more than this
  exceedanceRate: number;     // share of comparable background windows at least as far from the scene shift
}
export interface BoxRefusal { ok: false; reason: string }

export function analyzeBox(grid: DiffGrid, box: Box): BoxAnalysis | BoxRefusal {
  const problem = boxProblem(grid, box);
  if (problem) return { ok: false, reason: problem };
  const h = box.r1 - box.r0, w = box.c1 - box.c0, area = h * w;
  const values = boxValues(grid, box);
  if (values.length < MIN_VALID_FRACTION * area) {
    return { ok: false, reason: `Only ${Math.round(values.length / area * 100)}% of this box has valid paired pixels; at least ${MIN_VALID_FRACTION * 100}% is required.` };
  }
  let step = Math.max(1, Math.floor(Math.min(h, w) / 4));
  while (((grid.rows - h) / step + 1) * ((grid.cols - w) / step + 1) > MAX_REFERENCE_WINDOWS) step *= 2; // bound browser work
  const nulls = windowMedians(grid, h, w, step, box);
  if (nulls.length < MIN_REFERENCE_WINDOWS) {
    return { ok: false, reason: `Only ${nulls.length} comparable background windows exist outside this box (at least ${MIN_REFERENCE_WINDOWS} are needed). Choose a smaller box.` };
  }
  const sortedNulls = Float64Array.from(nulls).sort();
  const sceneShift = medianSorted(sortedNulls);
  const sorted = values.slice().sort();
  const medianDb = medianSorted(sorted);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) sum += sorted[i];
  const excess = medianDb - sceneShift;
  const deviations = Float64Array.from(nulls, (m) => Math.abs(m - sceneShift)).sort();
  let atLeast = 0;
  for (let i = 0; i < deviations.length; i++) if (deviations[i] >= Math.abs(excess) - 1e-12) atLeast++;
  return {
    ok: true, pixels: values.length, validFraction: values.length / area,
    medianDb, meanDb: sum / sorted.length, p05Db: percentile(sorted, 0.05), p95Db: percentile(sorted, 0.95),
    referenceWindows: nulls.length, sceneShiftDb: sceneShift, excessDb: excess,
    backgroundSpreadDb: percentile(deviations, 0.95),
    exceedanceRate: (1 + atLeast) / (nulls.length + 1),
  };
}

export function sameBox(a: Box, b: Box): boolean {
  return a.r0 === b.r0 && a.r1 === b.r1 && a.c0 === b.c0 && a.c1 === b.c1;
}

/** Expected number of boxes that look unusual by chance after `looks` independent checks. */
export function expectedChanceHits(looks: number, rate = BACKGROUND_RATE_THRESHOLD): number {
  return Math.max(0, looks) * rate;
}

// ---- Evidence readiness -------------------------------------------------------

export interface Condition { id: string; label: string; status: Status; detail: string }
export interface Readiness { conditions: Condition[]; met: number; total: number }

export function statusFromText(text: string | undefined): Status {
  if (!text) return "UNVERIFIED";
  const lead = text.slice(0, 24);
  if (/^PASS\b/i.test(lead)) return "PASS";
  if (/\bFAIL/i.test(lead)) return "FAIL";
  return "UNVERIFIED";
}

export interface ReadinessInput {
  quality: Partial<Record<"identificationGroup" | "frequencyAHHAndHVValidity" | "gridAlignment" | "radiometricArtifactsAndNoise", string>>;
  regionsWarning?: string;
  gridLoaded: boolean;
  hh?: BoxAnalysis | BoxRefusal; hv?: BoxAnalysis | BoxRefusal;
  selectedAsExtreme: boolean;
  candidateWindows?: number;
  independentEvidence: string[];
  /** True when no NISAR product pair has been processed for the location at all. */
  noNisarProduct?: boolean;
}

function backgroundCondition(pol: Polarization, result: BoxAnalysis | BoxRefusal | undefined, selected: boolean, candidates?: number): Condition {
  const label = `${pol} change stands out from background windows`;
  if (!result) return { id: `background-${pol}`, label, status: "NOT_PROVIDED", detail: "No numerical grid or valid box has been analysed." };
  if (!result.ok) return { id: `background-${pol}`, label, status: "UNVERIFIED", detail: result.reason };
  if (selected) {
    return { id: `background-${pol}`, label, status: "UNVERIFIED",
      detail: `This region was chosen by ranking ${candidates ?? "many"} candidate windows on their own measured differences, so standing out is expected by construction and cannot support a change claim.` };
  }
  const pct = (result.exceedanceRate * 100).toFixed(1);
  return result.exceedanceRate <= BACKGROUND_RATE_THRESHOLD
    ? { id: `background-${pol}`, label, status: "PASS", detail: `${pct}% of ${result.referenceWindows} background windows changed at least this far from the scene shift (threshold ${BACKGROUND_RATE_THRESHOLD * 100}%).` }
    : { id: `background-${pol}`, label, status: "FAIL", detail: `${pct}% of ${result.referenceWindows} background windows changed at least this far; indistinguishable from background variation.` };
}

export function buildReadiness(input: ReadinessInput): Readiness {
  const q = input.quality;
  if (input.noNisarProduct) return buildNoNisarReadiness(input.independentEvidence);
  const identification = (/identification-group QA checks failed/i.test(input.regionsWarning ?? ""))
    ? "FAIL" as Status : statusFromText(q.identificationGroup);
  const conditions: Condition[] = [
    { id: "alignment", label: "Both dates share one grid, track and frame", status: statusFromText(q.gridAlignment), detail: q.gridAlignment ?? "No alignment record supplied." },
    { id: "identification", label: "Official identification-group QA", status: identification, detail: [q.identificationGroup, input.regionsWarning && /identification-group QA checks failed/i.test(input.regionsWarning) ? "Region metadata reports the official checks failed." : ""].filter(Boolean).join(". ") || "No QA record supplied." },
    { id: "frequency", label: "Frequency A HH/HV validity", status: statusFromText(q.frequencyAHHAndHVValidity), detail: q.frequencyAHHAndHVValidity ?? "No validity record supplied." },
    { id: "artifacts", label: "RFI, noise and banding reviewed", status: statusFromText(q.radiometricArtifactsAndNoise), detail: q.radiometricArtifactsAndNoise ?? "No review record supplied." },
    { id: "grid", label: "Numerical difference grid supplied", status: input.gridLoaded ? "PASS" : "NOT_PROVIDED",
      detail: input.gridLoaded ? "Paired dB differences loaded from a numerical grid." : "No numerical difference grid has been exported for this study; no measured statistics are shown." },
    backgroundCondition("HH", input.hh, input.selectedAsExtreme, input.candidateWindows),
    backgroundCondition("HV", input.hv, input.selectedAsExtreme, input.candidateWindows),
  ];
  const hh = input.hh, hv = input.hv;
  let agree: Condition;
  if (hh?.ok && hv?.ok && !input.selectedAsExtreme) {
    const same = Math.sign(hh.excessDb) === Math.sign(hv.excessDb) && Math.sign(hh.excessDb) !== 0;
    const both = hh.exceedanceRate <= BACKGROUND_RATE_THRESHOLD && hv.exceedanceRate <= BACKGROUND_RATE_THRESHOLD;
    agree = { id: "agreement", label: "HH and HV both stand out in the same direction", status: same && both ? "PASS" : "FAIL",
      detail: `HH ${signedDb(hh.excessDb)} dB, HV ${signedDb(hv.excessDb)} dB relative to the scene shift.` };
  } else {
    agree = { id: "agreement", label: "HH and HV both stand out in the same direction", status: hh || hv ? "UNVERIFIED" : "NOT_PROVIDED",
      detail: input.selectedAsExtreme ? "Not testable for a region selected as an extreme." : "Needs a valid box analysed in both polarizations." };
  }
  conditions.push(agree);
  conditions.push({ id: "independent", label: "Independent evidence supplied (optical, gauge, field)", status: input.independentEvidence.length ? "PASS" : "NOT_PROVIDED",
    detail: input.independentEvidence.length ? input.independentEvidence.join("; ") : "None supplied. Radar backscatter change alone cannot establish a physical cause." });
  const met = conditions.filter((c) => c.status === "PASS").length;
  return { conditions, met, total: conditions.length };
}

const NO_NISAR = "No NISAR product pair has been processed for this location, so there is nothing to test.";

/** Readiness for a location without a processed NISAR pair: every radar condition stays visible as not provided. */
function buildNoNisarReadiness(independentEvidence: string[]): Readiness {
  const missing = (id: string, label: string): Condition => ({ id, label, status: "NOT_PROVIDED", detail: NO_NISAR });
  const conditions: Condition[] = [
    missing("alignment", "Both dates share one grid, track and frame"),
    missing("identification", "Official identification-group QA"),
    missing("frequency", "Frequency A HH/HV validity"),
    missing("artifacts", "RFI, noise and banding reviewed"),
    missing("grid", "Numerical difference grid supplied"),
    missing("background-HH", "HH change stands out from background windows"),
    missing("background-HV", "HV change stands out from background windows"),
    missing("agreement", "HH and HV both stand out in the same direction"),
    { id: "independent", label: "Independent evidence supplied (optical, gauge, field)", status: independentEvidence.length ? "PASS" : "NOT_PROVIDED",
      detail: independentEvidence.length ? `${independentEvidence.join("; ")}. Context only: it is not matched in time to any radar acquisition and cannot validate a radar change.` : "None supplied." },
  ];
  return { conditions, met: conditions.filter((c) => c.status === "PASS").length, total: conditions.length };
}

// ---- Alternative explanations -------------------------------------------------

export type Assessment = "NOT_ASSESSED" | "PARTLY_CHARACTERISED";
export interface Explanation { id: string; label: string; assessment: Assessment; wouldHelp: string }

/** Possible contributors, unranked and without probabilities. */
export function alternativeExplanations(hasBackgroundContext: boolean): Explanation[] {
  return [
    { id: "soil-moisture", label: "Soil or surface moisture change", assessment: "NOT_ASSESSED", wouldHelp: "Rain or soil-moisture records covering both dates." },
    { id: "standing-water", label: "Standing water among vegetation or open water", assessment: "NOT_ASSESSED", wouldHelp: "Independent water-extent evidence or gauge levels near both overpasses." },
    { id: "wind", label: "Wind-roughened water surface", assessment: "NOT_ASSESSED", wouldHelp: "Wind records at both overpass times." },
    { id: "phenology", label: "Seasonal vegetation or crop change", assessment: "NOT_ASSESSED", wouldHelp: "Cloud-free optical vegetation index near both dates." },
    { id: "radiometric", label: "Calibration, RFI, noise or banding", assessment: "NOT_ASSESSED", wouldHelp: "Completed official QA, RFI and noise review for both products." },
    { id: "masks", label: "Different valid-pixel masks on each date", assessment: "NOT_ASSESSED", wouldHelp: "Review of per-date masks for the box." },
    { id: "speckle", label: "Speckle and sampling variability", assessment: hasBackgroundContext ? "PARTLY_CHARACTERISED" : "NOT_ASSESSED", wouldHelp: "Compare with the background-window context above; larger boxes average speckle down." },
  ];
}

// ---- Report -------------------------------------------------------------------

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"'`]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[ch] as string));
}

export function reportFilename(study: string, label: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "box";
  return `tango-trust-${clean(study)}-${clean(label)}.html`;
}

export interface ReportInput {
  study: string; boxLabel: string; box: Box; dates: [string, string]; granules: [string, string];
  analyses: Partial<Record<Polarization, BoxAnalysis | BoxRefusal>>;
  readiness: Readiness; explanations: Explanation[];
  selectedAsExtreme: boolean; candidateWindows?: number; looks: number;
  pixelSpacingM?: [number, number];
  limitations: string[]; warning: string; generatedAt: string;
}

/** Signed fixed-point text that never prints "-0.00". */
export function signedDb(n: number, d = 2): string {
  const s = n.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1).replace(/^/, "+") : `${n >= 0 ? "+" : ""}${s}`;
}
const fmt = signedDb;

export function buildTrustReport(i: ReportInput): string {
  const rows = (["HH", "HV"] as const).map((pol) => {
    const a = i.analyses[pol];
    if (!a) return `<tr><td>${pol}</td><td colspan="6">Not analysed (no numerical grid).</td></tr>`;
    if (!a.ok) return `<tr><td>${pol}</td><td colspan="6">Refused: ${escapeHtml(a.reason)}</td></tr>`;
    return `<tr><td>${pol}</td><td>${a.pixels}</td><td>${fmt(a.medianDb)} dB</td><td>${fmt(a.sceneShiftDb)} dB</td><td>${fmt(a.excessDb)} dB</td><td>${a.backgroundSpreadDb.toFixed(2)} dB</td><td>${(a.exceedanceRate * 100).toFixed(1)}% of ${a.referenceWindows}</td></tr>`;
  }).join("");
  const conditions = i.readiness.conditions.map((c) =>
    `<li class="${escapeHtml(c.status.toLowerCase())}"><strong>${escapeHtml(c.status.replace("_", " "))}</strong> · ${escapeHtml(c.label)}<br><small>${escapeHtml(c.detail)}</small></li>`).join("");
  const explanations = i.explanations.map((e) =>
    `<li><strong>${escapeHtml(e.label)}</strong> · ${escapeHtml(e.assessment.replace("_", " ").toLowerCase())}<br><small>What would help: ${escapeHtml(e.wouldHelp)}</small></li>`).join("");
  const selected = i.selectedAsExtreme
    ? `<p class="warn">This region was chosen by ranking ${escapeHtml(i.candidateWindows ?? "many")} candidate windows on their own measured differences. Its background-window rate cannot support a change claim.</p>` : "";
  const looks = i.looks > 1
    ? `<p>${escapeHtml(i.looks)} boxes were checked in this session; about ${escapeHtml(expectedChanceHits(i.looks).toFixed(1))} would look unusual by chance at a 5% rate. The rate above is not corrected for repeated looks.</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tango evidence report: ${escapeHtml(i.study)} ${escapeHtml(i.boxLabel)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:50rem;margin:2rem auto;padding:0 1rem;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #888;padding:.3rem .5rem;text-align:left}.warn{border:2px solid #b00;padding:.6rem;font-weight:600}li{margin:.4rem 0}.fail strong{color:#b00}.pass strong{color:#060}@media print{body{margin:0}}</style></head><body>
<h1>Tango evidence report</h1>
<p class="warn">${escapeHtml(i.warning)}</p>
<p><strong>This report is an evidence checklist. It is not a scientific confidence score, a probability of change, or a detection of flooding, vegetation loss or displacement.</strong></p>
<h2>Provenance</h2>
<ul><li>Study: ${escapeHtml(i.study)}; box: ${escapeHtml(i.boxLabel)} (rows ${escapeHtml(i.box.r0)}–${escapeHtml(i.box.r1)}, columns ${escapeHtml(i.box.c0)}–${escapeHtml(i.box.c1)}, ${i.pixelSpacingM ? `${escapeHtml(Math.abs(i.pixelSpacingM[0]))} × ${escapeHtml(Math.abs(i.pixelSpacingM[1]))} m analysis-grid cells` : "analysis grid"})</li>
<li>Product: NASA NISAR L2 GCOV provisional, gamma0 backscatter via ASF DAAC; DOI 10.5067/NIL2GCOV-P1; frequency A, same track and frame</li>
<li>Dates: ${escapeHtml(i.dates[0])} (before) and ${escapeHtml(i.dates[1])} (after)</li>
<li>Granules: ${escapeHtml(i.granules[0])}, ${escapeHtml(i.granules[1])}</li>
<li>Measurement: paired per-pixel after minus before difference in dB from a numerical grid, not from image colors</li>
<li>Generated: ${escapeHtml(i.generatedAt)}</li></ul>
<h2>Measured statistics and background context</h2>
<table><thead><tr><th>Pol.</th><th>Valid pixels</th><th>Box median</th><th>Scene shift</th><th>Excess</th><th>Background spread (95%)</th><th>Background windows at least this far</th></tr></thead><tbody>${rows}</tbody></table>
${selected}${looks}
<p><small>Background windows are same-size boxes elsewhere in this scene. The rate describes how unusual the box is within its own scene; it does not remove scene-wide effects such as calibration or moisture shifts.</small></p>
<h2>Evidence readiness: ${escapeHtml(i.readiness.met)} of ${escapeHtml(i.readiness.total)} conditions met</h2><ul>${conditions}</ul>
<h2>Possible alternative explanations (unranked, no probabilities)</h2><ul>${explanations}</ul>
<h2>Limitations</h2><ul>${i.limitations.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
</body></html>`;
}
