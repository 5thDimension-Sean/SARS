"use client";

import { useEffect, useState } from "react";
import { STUDIES, dataUrl } from "@/lib/investigation";
import { parseAncillary, type AncillaryLayer } from "@/lib/ancillary";
import styles from "./context-layers.module.css";

type State = { status: "loading" } | { status: "none" } | { status: "invalid" } | { status: "ready"; layers: AncillaryLayer[] };
const KIND: Record<AncillaryLayer["kind"], string> = { population: "Population", land_cover: "Land cover", vegetation: "Vegetation", other: "Context" };

/**
 * Context for a study area: land cover, vegetation and population from independent datasets. Layers appear only when
 * the offline pipeline has produced a validated manifest; otherwise this says plainly that none has been supplied.
 */
export function ContextLayers() {
  const [id, setId] = useState<string>(STUDIES[0].id);
  const [states, setStates] = useState<Record<string, State>>({});
  useEffect(() => {
    if (states[id]) return;
    let live = true;
    const done = (s: State) => { if (live) setStates((p) => ({ ...p, [id]: s })); };
    fetch(dataUrl(`${id}-ancillary/ancillary.json`), { cache: "no-cache" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then((raw) => done(raw ? { status: "ready", layers: parseAncillary(raw, id) } : { status: "none" }))
      .catch(() => done({ status: "invalid" }));
    return () => { live = false; };
  }, [id, states]);
  const study = STUDIES.find((s) => s.id === id)!;
  const st = states[id] ?? { status: "loading" as const };
  return <section className={styles.section} aria-labelledby="context-title">
    <div className={styles.head}>
      <h2 id="context-title">What surrounds the radar.</h2>
      <p>Radar shows backscatter, not causes. To ask whether people shaped a place, we pair each scene with independent context: land cover, vegetation and population from published datasets.</p>
    </div>
    <div role="tablist" aria-label="Study area" className={styles.tabs}>
      {STUDIES.map((s) => <button key={s.id} role="tab" type="button" id={`ctx-tab-${s.id}`} aria-selected={s.id === id} aria-controls="ctx-panel" tabIndex={s.id === id ? 0 : -1} onClick={() => setId(s.id)}
        onKeyDown={(e) => { const i = STUDIES.findIndex((x) => x.id === id), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); const n = STUDIES[(i + d + STUDIES.length) % STUDIES.length].id; setId(n); document.getElementById(`ctx-tab-${n}`)?.focus(); } }}>{s.short}</button>)}
    </div>
    <div id="ctx-panel" role="tabpanel" aria-labelledby={`ctx-tab-${id}`} className={styles.panel}>
      <h3>{study.label}</h3>
      {st.status === "loading" && <p role="status" className={styles.muted}>Checking for context layers…</p>}
      {st.status === "invalid" && <p role="alert" className={styles.muted}>A context manifest exists for this place but failed validation, so nothing from it is shown.</p>}
      {st.status === "none" && <div className={styles.empty}>
        <p><strong>No context layers have been supplied for this place yet.</strong> No land cover, vegetation or population figures are shown, and none are estimated.</p>
        <p>They are produced offline with <code>pipeline/build_ancillary.py</code> from datasets such as ESA WorldCover, NLCD, WorldPop or GHSL, then published with their source, year, license and caveats.</p>
      </div>}
      {st.status === "ready" && <ul className={styles.layers}>{st.layers.map((l) => <li key={l.id} className={styles.layer}>
        <p className={styles.kind}>{KIND[l.kind]} · {l.year}</p>
        <h4>{l.title}</h4>
        {l.total && <p className={styles.big}>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(l.total.value)} <span>{l.total.unit}</span></p>}
        {l.classes && <ul className={styles.bars} aria-label={`${l.title} class shares`}>{[...l.classes].sort((a, b) => b.fraction - a.fraction).map((c) => <li key={c.label}>
          <span>{c.label}</span><span className={styles.bar} aria-hidden="true"><i style={{ width: `${(c.fraction * 100).toFixed(1)}%` }} /></span><span>{(c.fraction * 100).toFixed(1)}%</span></li>)}</ul>}
        <p className={styles.meta}>{(l.validFraction * 100).toFixed(0)}% of the footprint had valid data · {l.resolutionM} m · {l.license}{l.version ? ` · ${l.version}` : ""}</p>
        <p className={styles.meta}>{l.caveat}</p>
        <a href={l.sourceUrl} rel="noopener noreferrer" target="_blank">{l.source}</a>
      </li>)}</ul>}
    </div>
    <ul className={styles.status} aria-label="Challenge coverage">
      <li data-ok="true"><strong>Polarizations:</strong> HH and HV from NISAR L2 GCOV at every place.</li>
      <li data-ok="true"><strong>Dates:</strong> two acquisitions at every place, so a before and after.</li>
      <li data-ok="false"><strong>Time series:</strong> needs three or more dates per place; not yet processed, so none is shown.</li>
      <li data-ok="false"><strong>Other sensors and frequencies:</strong> none processed yet; only NISAR L-band is shown.</li>
    </ul>
  </section>;
}
