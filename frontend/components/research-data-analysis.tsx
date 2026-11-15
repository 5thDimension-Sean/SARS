"use client";

import type { ResearchStudy } from "@/lib/research-studies";
import styles from "./research-preview.module.css";

type EvidenceCheck = { name: string; status: "Available" | "Unverified" | "Not processed"; explanation: string };

function checks(study: ResearchStudy): EvidenceCheck[] {
  const hubbard = study.id === "hubbard";
  return [
    { name: "Before / after source imagery", status: "Available", explanation: hubbard
      ? "NASA Earth Observatory's published November 26 and December 8, 2025 radar visualizations; these are publisher composites, not our numerical rasters."
      : "NASA / ASF's October 7 and October 19, 2026 HH and HV browse images. File-integrity checks do not validate radiometry." },
    { name: "Matched measurement geometry and product QA", status: "Unverified", explanation: hubbard
      ? "The event-spanning source granules have not been independently identified, aligned and checked for product-level quality."
      : "Identification QA issues remain unresolved; compatible grids, masks, radiometric scale, and processing quality have not been independently cleared." },
    { name: "HH / HV regional statistics", status: "Not processed", explanation: hubbard
      ? "The NASA-published images are not separately calibrated HH and HV numerical exports."
      : "Original screened source arrays and reproducible region-of-interest statistics have not been published for this location." },
    { name: "Histograms and same-pixel difference", status: "Not processed", explanation: "No validated numerical raster pair, shared pixel mask, or derived histogram bins is available. Values cannot be reconstructed from the displayed image colors." },
    { name: "Independent attribution", status: "Unverified", explanation: hubbard
      ? "NASA documents earthquake-triggered slope failures, but our application has not independently mapped or quantified avalanche debris."
      : "The images show radar texture. No event, dune migration, or physical surface change has been established from this pair." },
  ];
}

/** The same analysis/evidence/interpretation structure as a processed investigation, without manufactured measurements. */
export function ResearchDataAnalysis({ study }: { study: ResearchStudy }) {
  if (study.id !== "hubbard" && study.id !== "sossusvlei") return null;
  const hubbard = study.id === "hubbard";
  const rows = checks(study);
  return <section id="research-data-analysis" className={styles.qa} aria-labelledby="research-data-heading">
    <span className={styles.small}>LOCATION ANALYSIS · SOURCED, EXPLORATORY</span>
    <h3 id="research-data-heading">What do the observations tell us?</h3>
    <p>{hubbard
      ? "Compare NASA's two published radar images across the December 6, 2025 earthquake. NASA's accompanying interpretation identifies newly visible landslide and avalanche debris. The images support visual review of that published finding; they do not provide our own debris area, displacement, or HH/HV change calculations."
      : "Inspect the two official Sossusvlei scene previews in each polarization. HH and HV respond differently to the desert surface. The images reveal spatial texture and terrain patterns, but changes in image brightness cannot be treated as a calibrated temporal difference."}</p>
    <h4>Acquisition and data coverage</h4>
    <div className={styles.evidenceGrid}>
      <div><span className={styles.small}>Earlier observation</span><p><strong>{study.observationDates[0]}</strong></p></div>
      <div><span className={styles.small}>Later observation</span><p><strong>{study.observationDates[1]}</strong></p></div>
      <div><span className={styles.small}>Radar evidence</span><p><strong>{hubbard ? "Published visualizations" : "Official HH / HV browse"}</strong></p></div>
      <div><span className={styles.small}>Numerical difference</span><p><strong>Not available</strong></p></div>
    </div>
    <h4>Data analysis and verification</h4>
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead><tr><th scope="col">Evidence component</th><th scope="col">Status</th><th scope="col">What we can verify</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name}>
          <th scope="row" style={{ verticalAlign: "top", padding: "0.75rem 0.5rem 0.75rem 0" }}>{row.name}</th>
          <td style={{ verticalAlign: "top", padding: "0.75rem 0.5rem" }}><strong>{row.status}</strong></td>
          <td style={{ verticalAlign: "top", padding: "0.75rem 0" }}>{row.explanation}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <h4>Evidence-based reasoning</h4>
    <p><strong>Observation:</strong> {hubbard
      ? "Two published radar visualizations bracket an earthquake that NASA associates with slope failures."
      : "Two dates of NASA radar browse imagery are available in HH and HV."}</p>
    <p><strong>Possible interpretation:</strong> {hubbard
      ? "The changed radar appearance is consistent with the publisher's reported avalanche and landslide deposits, but our app has not independently measured them."
      : "Radar contrast may reflect surface roughness, dune geometry, moisture, viewing conditions, or processing differences; none is a confirmed change mechanism."}</p>
    <p><strong>Limits:</strong> No measured change magnitude, percentage, affected area, mapped hazard extent, or confidence score is claimed from these image files.</p>
    <p><strong>Next validation:</strong> {study.nextStep}</p>
    <p className={styles.code}>EXPLORATORY_NOT_CLEARED · Numerical HH/HV analysis pending source-grid verification</p>
    <p>Source documentation: {study.sources.map((source, i) => <span key={source.url}>{i > 0 ? " · " : ""}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></span>)}</p>
  </section>;
}
