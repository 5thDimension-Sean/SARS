"use client";

import styles from "./evidence-pathway.module.css";

const steps = [
  { number: "01", heading: "Understand the location", status: "Published geographic context", detail: "Why the Padma River is an important case of riverbank erosion, channel migration and deposition.", href: "#context", action: "Read the location story", available: true },
  { number: "02", heading: "Inspect satellite imagery", status: "NASA Landsat images", detail: "Compare real 1988 and 2018 optical/infrared views of the same river system using side-by-side or date-toggle controls.", href: "#look", action: "Explore before and after", available: true },
  { number: "03", heading: "Examine the data", status: "NISAR numerical analysis unavailable", detail: "Read the sourced historical figures and the acquisition table. HH/HV histograms, ROI statistics and measured change maps are not yet available.", href: "#compare", action: "View observations and data gaps", available: false },
  { number: "04", heading: "Test the interpretation", status: "Published erosion · no TANGO validation", detail: "Check NASA sources, method limitations and the additional ground truth needed for quantitative erosion estimates.", href: "#verify", action: "Review evidence and limitations", available: true },
] as const;

export function ProcessedEvidencePathway() {
  return <section className={styles.pathway} aria-label="Padma evidence and reasoning guide">
    <div className={styles.header}><h2>From observation to evidence.</h2>
      <p>Independent Landsat imagery; missing measurements stay unavailable.</p>
    </div>
    <ol className={styles.steps}>
      {steps.map(step => <li key={step.number} className={styles.step}>
        <div className={styles.top}><span className={styles.number}>{step.number}</span><span className={styles.status} data-available={step.available}>{step.status}</span></div>
        <h3>{step.heading}</h3><details><summary>Why</summary><p>{step.detail}</p></details>
        <a className={styles.action} href={step.href}>{step.action} ↗</a>
      </li>)}
    </ol>
    <p className={styles.disclaimer}><strong>Science note:</strong> Published riverbank erosion is documented by NASA, but two displayed Landsat images do not independently quantify erosion for TANGO. No radar measurements are inferred from image colors.</p>
  </section>;
}
