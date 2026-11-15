import { escapeHtml } from "./evidence.ts";

export interface ReportTable { caption: string; head: string[]; rows: string[][] }
export interface ReportCheck { label: string; state: "PASS" | "FAIL" | "UNVERIFIED" | "MISSING"; text: string }
export interface PlaceReport {
  title: string; dates: [string, string]; polarizations: string[]; granules: [string, string]; source: string;
  status: string; tables: ReportTable[]; checks: ReportCheck[]; limitations: string[]; generated: string;
}

/**
 * A printable, self-contained evidence report for one place, built only from the published numbers and QA record.
 * Every string is escaped. Failed and unverified checks are listed as prominently as passes, and the report states
 * plainly that radar backscatter change does not establish a physical cause.
 */
export function placeReportHtml(r: PlaceReport): string {
  const e = escapeHtml;
  const table = (t: ReportTable) => `<table><caption>${e(t.caption)}</caption><thead><tr>${t.head.map((h) => `<th scope="col">${e(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((c, i) => (i ? `<td>${e(c)}</td>` : `<th scope="row">${e(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table>`;
  const checks = r.checks.map((c) => `<tr class="${e(c.state.toLowerCase())}"><th scope="row">${e(c.label)}</th><td><strong>${e(c.state)}</strong> ${e(c.text)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(r.title)} · Tango evidence report</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111}h1{font-size:1.9rem;margin:0 0 .25rem}h2{margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.25rem}table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.9rem}caption{text-align:left;font-weight:600;padding-bottom:.25rem}th,td{border:1px solid #aaa;padding:.35rem .5rem;text-align:left;vertical-align:top}tr.fail th,tr.fail td{background:#fde8e8}tr.unverified td,tr.missing td{background:#fff6e0}.note{border:1px solid #aaa;padding:.75rem 1rem;background:#f5f5f5}small{color:#555}@media print{a{color:inherit}body{margin:0}}</style>
<h1>${e(r.title)}</h1>
<p>${e(r.dates[0])} → ${e(r.dates[1])} · ${e(r.polarizations.join(" and "))} · generated ${e(r.generated)}</p>
<p class="note"><strong>Status: ${e(r.status)}.</strong> Radar backscatter differences do not establish flooding, vegetation loss, burned area, damage or ground displacement. This report is a record of what was measured and what has not been checked. It is not a confidence score.</p>
<h2>Provenance</h2><p>${e(r.source)}</p><p>Granules: ${r.granules.map((g) => e(g)).join(" and ")}</p>
<h2>Measurements</h2>${r.tables.map(table).join("")}
<h2>Quality checks</h2><table><thead><tr><th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody>${checks}</tbody></table>
<h2>Known limitations</h2><ul>${r.limitations.map((l) => `<li>${e(l)}</li>`).join("")}</ul>
<hr><small>Tango is an independent educational project made for the NASA Space Apps Challenge. It is not affiliated with NASA. Data: NASA NISAR L2 GCOV (provisional) via the ASF DAAC.</small></html>`;
}

export function reportFileName(title: string, dates: [string, string]): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "place";
  return `tango-${slug}-${dates[0]}-${dates[1]}.html`;
}

/** Offers the report as a download. Browser only. */
export function downloadReport(r: PlaceReport) {
  const url = URL.createObjectURL(new Blob([placeReportHtml(r)], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = reportFileName(r.title, r.dates);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
