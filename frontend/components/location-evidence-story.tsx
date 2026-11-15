"use client";

import type { Evidence, Pol, StudyConfig } from "@/lib/investigation";
import { fmtDate, fmtInt, fmtSignedDb } from "@/lib/investigation";
import { RESEARCH_STUDIES, type ResearchStudy } from "@/lib/research-studies";
import { SITE_CONTEXT } from "@/lib/location-context";
import hawaii from "@/public/data/hawaii-review/hawaii-summary.json";
import iowa from "@/public/data/iowa-review/iowa-summary.json";
import styles from "./location-evidence-story.module.css";

/**
 * Context describes where the NASA radar was acquired. It is not a conclusion
 * about what *caused* measured backscatter changes.
 */

const statusPhrase = (delta: number) =>
  Math.abs(delta) < .005 ? "was essentially unchanged" :
  delta > 0 ? "was higher" : "was lower";

function Definition({ site }: { site: StudyConfig["id"] }) {
  const context = SITE_CONTEXT[site];
  return <div className={styles.grid}>
    <div className={styles.item}>
      <span className={styles.eyebrow}>THE PLACE</span>
      <h3>What is happening here?</h3><p>{context.setting}</p>
    </div>
    <div className={styles.item}>
      <span className={styles.eyebrow}>POSSIBLE EXPLANATIONS · NOT CONFIRMED</span>
      <h3>Why might radar change?</h3><p>{context.canSuggest}</p>
    </div>
    <div className={styles.item}>
      <span className={styles.eyebrow}>SCIENTIFIC LIMIT</span>
      <h3>What does it not prove?</h3><p>{context.cannotConfirm}</p>
    </div>
    <div className={styles.item}>
      <span className={styles.eyebrow}>WHAT TO CHECK NEXT</span>
      <h3>How could we verify it?</h3><p>{context.nextEvidence}</p>
    </div>
  </div>;
}

export function FullStudyEvidenceStory({ study, evidence, pol }: {
  study: StudyConfig; evidence: Evidence; pol: Pol;
}) {
  const hh = evidence.pols.HH, hv = evidence.pols.HV, active = evidence.pols[pol];
  const delta = active.differenceOfRegionalMediansDb;
  return <section className={styles.section} aria-labelledby="location-observation">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>UNDERSTAND THIS LOCATION · NASA NISAR L-BAND</span>
      <h2 id="location-observation">What did the satellite actually observe?</h2>
      <p>Two real observations, on <strong>{fmtDate(study.dates[0])}</strong> and <strong>{fmtDate(study.dates[1])}</strong>. Radar measures how strongly the surface reflects microwaves—not a photograph of an event.</p>
    </div>
    <div className={styles.metrics}>
      <div><span>HH · change in whole-scene median</span><strong>{fmtSignedDb(hh.differenceOfRegionalMediansDb)}</strong></div>
      <div><span>HV · change in whole-scene median</span><strong>{fmtSignedDb(hv.differenceOfRegionalMediansDb)}</strong></div>
      <div><span>Analysis-grid pixels · {pol}</span><strong>{fmtInt(active.observations[0].count)} / {fmtInt(active.observations[1].count)}</strong></div>
    </div>
    <p className={styles.reading}>In the displayed <strong>{pol}</strong> channel, the median radar return {statusPhrase(delta)} on the later date (<strong>{fmtSignedDb(delta)}</strong>). These are two separate whole-scene medians; this number is <strong>not</strong> the median of pixel-by-pixel changes. Use the A/B/C region inspector for paired-pixel measurements.</p>
    <Definition site={study.id} />
    <p className={styles.caveat}><strong>Evidence status: exploratory, not independently cleared.</strong> Radar backscatter alone cannot identify a physical cause; inspect the quality checks, histograms and source information below before drawing conclusions.</p>
  </section>;
}

type NativeSummary = typeof hawaii;
export function NativeStudyEvidenceStory({ id, pol }: { id: "hawaii" | "iowa"; pol: Pol }) {
  const study = id === "hawaii" ? hawaii : iowa as unknown as NativeSummary;
  const a = study.polStats[pol], hh = study.polStats.HH, hv = study.polStats.HV;
  return <section className={styles.section} aria-labelledby="native-observation">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>ACTUAL PAIRED NISAR RADAR MEASUREMENTS</span>
      <h2 id="native-observation">The whole scene, explained</h2>
      <p>Both dates use the same radar grid. The pixel-by-pixel differences below are calculated from real HH/HV values; they do not establish what physically happened.</p>
    </div>
    <div className={styles.metrics}>
      <div><span>HH paired-pixel median change</span><strong>{fmtSignedDb(hh.pairedDifferenceMedianDb, 3)}</strong></div>
      <div><span>HV paired-pixel median change</span><strong>{fmtSignedDb(hv.pairedDifferenceMedianDb, 3)}</strong></div>
      <div><span>Valid aligned pixels</span><strong>{fmtInt(study.commonValidPixels)}</strong></div>
    </div>
    <p className={styles.reading}>In <strong>{pol}</strong>, the median of paired radar-return differences {statusPhrase(a.pairedDifferenceMedianDb)} ({fmtSignedDb(a.pairedDifferenceMedianDb, 3)}). This describes radar intensity; it does not prove a harvest or eruption.</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <caption>Measured {pol} backscatter · same native pixels</caption>
      <thead><tr><th>Statistic</th><th>{fmtDate(study.dates[0])}</th><th>{fmtDate(study.dates[1])}</th><th>Later − earlier</th></tr></thead>
      <tbody>
        <tr><th>Median of common pixels (dB)</th><td>{a.beforeMedianDbOnCommonPixels.toFixed(3)}</td><td>{a.afterMedianDbOnCommonPixels.toFixed(3)}</td><td>Separate medians</td></tr>
        <tr><th>Paired-pixel difference (dB)</th><td colSpan={2}>Computed from the same screened pixel positions</td><td><strong>{fmtSignedDb(a.pairedDifferenceMedianDb, 3)}</strong></td></tr>
        <tr><th>Paired-pixel mean difference (dB)</th><td colSpan={2}>Mean across common valid pixels</td><td>{fmtSignedDb(a.pairedDifferenceMeanDb, 3)}</td></tr>
        <tr><th>Paired-pixel 5th–95th percentile (dB)</th><td colSpan={2}>Range of individual pixel changes</td><td>{fmtSignedDb(a.pairedDifferenceP05Db, 2)} to {fmtSignedDb(a.pairedDifferenceP95Db, 2)}</td></tr>
      </tbody></table></div>
    <p className={styles.caveat}>A full per-date histogram was not published for this study, so we do not invent histogram bins. The numeric table is calculated from the available screened NISAR raster data.</p>
    <Definition site={id} />
    <p className={styles.caveat}><strong>Quality review:</strong> {study.qaReview}. Environmental attribution remains unverified.</p>
  </section>;
}

export function ResearchLocationEvidenceStory({ study }: { study: ResearchStudy }) {
  const isCandidate = study.evidence === "candidate";
  const publisher = study.evidence === "published-change" || study.evidence === "published-scene";
  const dateText = study.observationDates.length ? study.observationDates.map(fmtDate).join(" → ") : "No verified temporal pair";
  return <section className={styles.section} aria-labelledby="research-observation">
    <div className={styles.intro}>
      <span className={styles.eyebrow}>WHAT WE CAN SAY · SOURCE-VERIFIED RESEARCH</span>
      <h2 id="research-observation">What is happening at this location?</h2>
      <p><strong>{study.event}.</strong> {study.story}</p>
    </div>
    <div className={styles.metrics}>
      <div><span>Published observation dates</span><strong className={styles.metricSmall}>{dateText}</strong></div>
      <div><span>Source evidence</span><strong className={styles.metricSmall}>{publisher ? "Published NASA / ISRO imagery" : isCandidate ? "Candidate only" : "Official NISAR browse"}</strong></div>
      <div><span>Our numeric HH/HV change analysis</span><strong className={styles.metricSmall}>Not available</strong></div>
    </div>
    <div className={styles.grid}>
      <div className={styles.item}><span className={styles.eyebrow}>OBSERVATION</span><h3>What can visitors inspect?</h3>
        <p>{isCandidate ? "No verified NISAR before/after pair or radar measurements are available for this event." : publisher ? "The publisher's documented imagery and accompanying explanation. This is not our own processed NISAR difference raster." : "Original official scene previews for the listed dates, not a radiometrically validated change map."}</p></div>
      <div className={styles.item}><span className={styles.eyebrow}>INTERPRETATION</span><h3>What is still uncertain?</h3>
        <p>{study.limitations[0]}</p></div>
      <div className={styles.item}><span className={styles.eyebrow}>QUALITY</span><h3>Scientific checks</h3>
        <p>Official images or catalog metadata may be available, but TANGO has not independently cleared the product QA or calculated numerical before/after change here.</p></div>
      <div className={styles.item}><span className={styles.eyebrow}>NEXT STEP</span><h3>How to build stronger evidence</h3>
        <p>{study.nextStep}</p></div>
    </div>
    <p className={styles.caveat}><strong>Not available:</strong> no real histogram-bin counts, paired-pixel A/B/C statistics, or quantitative change raster have been generated for this research location. No numbers or images are substituted.</p>
  </section>;
}

/** Kept in sync with the actual research catalog, not a synthetic list. */
export const ALL_RESEARCH_EVIDENCE_IDS = RESEARCH_STUDIES.map(s => s.id);
