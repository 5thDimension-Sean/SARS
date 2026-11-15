export type EvidenceRow = { label: string; status: "PASS" | "MISSING" | "UNVERIFIED"; detail: string };
export interface Investigation {
  label: string;
  mode: "sample" | "derived";
  before: string;
  after: string;
  polarization: string;
  source: string;
  versionsMatch: boolean;
  numericAvailable: boolean;
  notes: string[];
}
export function evidenceRows(input: Investigation): EvidenceRow[] {
  return [
    { label: "Measured source", status: input.mode === "derived" ? "PASS" : "MISSING", detail: input.mode === "derived" ? input.source : "Fictional sample; no observed NISAR data." },
    { label: "Distinct acquisitions", status: input.before !== input.after ? "PASS" : "MISSING", detail: `${input.before} / ${input.after}${input.mode === "sample" ? " (illustrative)" : ""}` },
    { label: "Processing agreement", status: input.mode === "derived" && input.versionsMatch ? "PASS" : "UNVERIFIED", detail: "Version, release and maturity must agree. Agreement alone does not establish calibration quality." },
    { label: "Numerical overview grids", status: input.numericAvailable ? "PASS" : "MISSING", detail: "Requires matching dates, polarization, geometry and valid cells. RGB imagery is never a numerical source." },
    { label: "Official QA and artifacts", status: "UNVERIFIED", detail: "Review official QA, RFI, masks, banding and noise-floor effects. Current Everglades pair is NOT CLEARED." },
    { label: "Independent verification", status: "UNVERIFIED", detail: "Backscatter changes do not establish a physical cause, affected area or displacement." },
  ];
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function investigationReport(input: Investigation): string {
  const esc = escapeHtml;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Tango investigation</title><style>body{font:16px system-ui;max-width:800px;margin:2rem auto;padding:1rem;line-height:1.5}td,th{border:1px solid #aaa;padding:.5rem;text-align:left}table{border-collapse:collapse;width:100%}@media print{body{margin:0;font-size:11pt}}</style><h1>${esc(input.label)}</h1><p><strong>${input.mode === "sample" ? "FICTIONAL SAMPLE — NO OBSERVED DATA" : "DERIVED GCOV — SCIENTIFIC CLEARANCE UNVERIFIED"}</strong></p><p>Before: ${esc(input.before)}<br>After: ${esc(input.after)}<br>Polarization: ${esc(input.polarization)}<br>Source: ${esc(input.source)}</p><table><thead><tr><th>Evidence</th><th>Status</th><th>Detail</th></tr></thead><tbody>${evidenceRows(input).map((r) => `<tr><td>${esc(r.label)}</td><td>${r.status}</td><td>${esc(r.detail)}</td></tr>`).join("")}</tbody></table><h2>Limitations and provenance</h2><ul>${input.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p>Checklist completion is not scientific confidence. No environmental classification or displacement is established by this report. Numerical ROI values require separately validated common support; none are inferred from image colors.</p></html>`;
}
