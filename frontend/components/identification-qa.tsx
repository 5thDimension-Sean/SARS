import { IDENTIFICATION_QA, IDENTIFICATION_LIMITS } from "@/lib/identification-qa";
import { dataUrl } from "@/lib/investigation";
import styles from "./investigation/investigation.module.css";

/** Applies to the exact twelve acquisitions in the published six-study audit. */
export function IdentificationQa() {
  return <aside className={styles.notice} aria-label="Known identification QA failures">
    <p><strong>Known metadata QA failures.</strong> {IDENTIFICATION_QA}</p>
    <p>{IDENTIFICATION_LIMITS}</p>
    <a href={dataUrl("identification-qa-audit.json")} download>Download QA evidence for the six studies (JSON)</a>
  </aside>;
}
