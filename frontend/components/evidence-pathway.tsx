"use client";

import Link from "next/link";
import type { Evidence, Pol, StudyConfig } from "@/lib/investigation";
import { fmtDate, fmtInt, fmtSignedDb } from "@/lib/investigation";
import type { ResearchStudy } from "@/lib/research-studies";
import { SITE_CONTEXT } from "@/lib/location-context";
import styles from "./evidence-pathway.module.css";

type Step = {
  number: string;
  heading: string;
  status: string;
  detail: string;
  href: string;
  action: string;
  available: boolean;
};
function Pathway({ title, introduction, steps }: { title: string; introduction: string; steps: readonly Step[] }) {
  return <section className={styles.pathway} aria-label="Evidence and reasoning guide">
    <div className={styles.header}>
      <span className={styles.eyebrow}>YOUR EVIDENCE GUIDE · FOUR STEPS</span>
      <h2>{title}</h2>
      <p>{introduction}</p>
    </div>
    <ol className={styles.steps}>
      {steps.map(step => <li key={step.number} className={styles.step}>
        <div className={styles.top}>
          <span className={styles.number} aria-hidden="true">{step.number}</span>
          <span className={styles.status} data-available={step.available}>{step.status}</span>
        </div>
        <h3>{step.heading}</h3>
        <p>{step.detail}</p>
        <Link className={styles.action} href={step.href}>{step.action} <span aria-hidden="true">↗</span></Link>
      </li>)}
    </ol>
    <p className={styles.disclaimer}><strong>How to read this:</strong> An observed radar difference is evidence of a difference in backscatter. It does not by itself establish flooding, erosion, lava, fire damage, or another physical cause. Sources and scientific checks remain visible in every location.</p>
  </section>;
}

export function ProcessedEvidencePathway({ study, evidence, pol }: {
  study: StudyConfig; evidence: Evidence; pol: Pol;
}) {
  const obs = evidence.pols[pol].observations;
  const change = evidence.pols[pol].differenceOfRegionalMediansDb;
  const context = SITE_CONTEXT[study.id];
  const steps: Step[] = [
    {
      number: "01", heading: "Understand the location", status: "Grounded context",
      detail: context.setting, href: "#location-observation",
      action: "Read the location reasoning", available: true,
    },
    {
      number: "02", heading: "Inspect the radar imagery", status: "NISAR observations",
      detail: `Compare the actual ${fmtDate(study.dates[0])} and ${fmtDate(study.dates[1])} acquisitions using swipe, side-by-side or the measured change view. The imagery shows radar response, not the event itself.`,
      href: "#look", action: "Open the interactive comparison", available: true,
    },
    {
      number: "03", heading: "Examine measured evidence", status: "Real HH / HV data",
      detail: `For ${pol}, whole-scene median backscatter changed by ${fmtSignedDb(change)} (later summary minus earlier summary) across ${fmtInt(obs[0].count)} and ${fmtInt(obs[1].count)} screened pixels. Histograms and paired-pixel A/B/C measurements are below; do not confuse these two types of statistics.`,
      href: "#compare", action: "Explore histograms and statistics", available: true,
    },
    {
      number: "04", heading: "Test the interpretation", status: "Exploratory · QA not cleared",
      detail: `${context.cannotConfirm} ${context.nextEvidence}`,
      href: "#verify", action: "Inspect QA, limitations and provenance", available: true,
    },
  ];
  return <Pathway title="From observation to evidence." introduction="The same scientific workflow applies at every processed location. Follow the source imagery, quantitative measurements, possible interpretations, and the checks that could support or rule them out." steps={steps} />;
}

export function ResearchEvidencePathway({ study }: { study: ResearchStudy }) {
  const hasPublishedImages = study.gallery !== "pending" && (study.media.length > 0 || !!study.video);
  const isEtna = study.id === "etna";
  const twoDates = study.observationDates.length === 2;
  const dates = twoDates ? `${fmtDate(study.observationDates[0])} and ${fmtDate(study.observationDates[1])}` :
    study.observationDates.length === 1 ? fmtDate(study.observationDates[0]) : "No independently verified two-date pair";
  const steps: Step[] = [
    {
      number: "01", heading: "Understand the location", status: "Documented context",
      detail: `${study.event}. ${study.story}`,
      href: "#research-observation", action: "Read the location reasoning", available: true,
    },
    {
      number: "02", heading: "Inspect the available imagery",
      status: hasPublishedImages ? "Publisher imagery available" : "No comparable imagery verified",
      detail: hasPublishedImages
        ? `Examine the source-provided scene images or sequence. Observation dates: ${dates}. Published image colors are not calibrated numerical radar values.`
        : "This event has source documentation, but TANGO has not verified an appropriate NISAR before/after pair. No substitute imagery is shown.",
      href: "#research-images", action: hasPublishedImages ? "Explore source images" : "See the data-availability explanation",
      available: hasPublishedImages,
    },
    {
      number: "03", heading: "Examine measured evidence",
      status: isEtna ? "Processed NISAR statistics available" : "No TANGO numerical analysis",
      detail: isEtna
        ? "This location also has a separate numerical investigation from original NISAR GCOV products, with real HH/HV histograms, difference maps and A/B/C statistics. The research imagery below remains unchanged."
        : "No compatible TANGO numerical HH/HV comparison is published for this research entry. Histogram counts, paired pixel differences and A/B/C values cannot be reconstructed from PNG colors or assumed from an event.",
      href: isEtna ? "/etna-investigation" : "#research-qa", action: isEtna ? "Open full measured investigation" : "Read why numbers are unavailable",
      available: isEtna,
    },
    {
      number: "04", heading: "Test the interpretation", status: "Not scientifically cleared",
      detail: `${study.limitations[0]} ${study.nextStep}`,
      href: "#research-sources", action: "Check original sources and next steps",
      available: true,
    },
  ];
  return <Pathway title="From observation to evidence." introduction="Every location uses the same four-stage reasoning guide. A research location may have publisher imagery but not processed measurements, so its evidence status is shown directly instead of filling gaps with invented data." steps={steps} />;
}
