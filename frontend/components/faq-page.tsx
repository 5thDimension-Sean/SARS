"use client";

import { useState } from "react";
import { FAQ, searchFaq } from "@/lib/faq";
import { SiteFooter } from "./site-footer";
import styles from "./investigation/investigation.module.css";

/** Questions and answers, as their own page in the navigation. Answers are written in advance; nothing is generated. */
export function FaqPage() {
  const [query, setQuery] = useState("");
  const results = searchFaq(query);
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <section className={styles.section} style={{ paddingTop: "clamp(48px, 9vw, 120px)" }} aria-labelledby="h-faq">
        <header><h1 id="h-faq" style={{ fontSize: "clamp(2.5rem, 6.4vw, 5.25rem)", fontWeight: 600, letterSpacing: "-.055em", lineHeight: 1 }}>Questions</h1>
          <p className={styles.lead}>Search a word like “HV” or “flood”.</p></header>
        <input className={styles.search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the answers" aria-label="Search the answers" />
        <p className={styles.small} role="status" aria-live="polite" style={{ margin: "10px 0" }}>{query.trim() ? `${results.length} of ${FAQ.length} answers` : ""}</p>
        {results.length === 0 ? <p className={styles.notice}>No answer matches “{query.trim()}”. Try words like HH, dB, region, flood, data or upload.</p>
          : <div className={styles.faq}>{results.map((f) => <details key={f.id} open={!!query.trim() && results[0]?.id === f.id}><summary>{f.question}</summary><p>{f.answer}</p></details>)}</div>}
      </section>
      <SiteFooter />
    </div>
  </main>;
}
