"use client";

import { useEffect, useState } from "react";
import { STUDIES, dataUrl } from "@/lib/investigation";
import { PLACES } from "@/lib/places";
import { parseAncillary, type AncillaryLayer } from "@/lib/ancillary";
import styles from "./context-layers.module.css";

type State = { status: "loading" } | { status: "none" } | { status: "invalid" } | { status: "ready"; layers: AncillaryLayer[] };
const CONTEXT: Record<string, { setting: string; interpretation: string; sources: { name: string; url: string; use: string }[] }> = {
  everglades: { setting: "Wetlands, freshwater marsh and sawgrass", interpretation: "Water level and wetland vegetation both influence radar return. A single brightness difference cannot isolate either mechanism.", sources: [
    { name: "USGS National Land Cover Database", url: "https://www.mrlc.gov/data", use: "Land cover classification for the U.S." },
    { name: "USGS Everglades research", url: "https://www.usgs.gov/centers/wetland-and-aquatic-research-center/science/everglades", use: "Wetland ecosystem background" }] },
  louisiana: { setting: "Mississippi River delta, wetlands and open water", interpretation: "Shoreline, vegetation, sediment and water conditions can change radar appearance. Land-loss claims require mapped shorelines and independent observations.", sources: [
    { name: "USGS Coastal Change Hazards", url: "https://www.usgs.gov/programs/coastal-and-marine-hazards-and-resources-program", use: "Coastal change context" },
    { name: "USGS National Land Cover Database", url: "https://www.mrlc.gov/data", use: "U.S. land cover" }] },
  california: { setting: "Steep coastal hills, chaparral and mixed vegetation", interpretation: "Terrain, vegetation, moisture and burn history can affect the scene. Fire impacts cannot be identified from radar differences alone.", sources: [
    { name: "USGS National Land Cover Database", url: "https://www.mrlc.gov/data", use: "U.S. land cover" },
    { name: "NASA FIRMS", url: "https://firms.modaps.eosdis.nasa.gov/", use: "Active fire and thermal anomaly context" }] },
  hawaii: { setting: "Volcanic summit, exposed rock and sparse vegetation", interpretation: "Roughness, new surface material and observation geometry affect radar brightness; radar backscatter is not a lava-flow map.", sources: [
    { name: "USGS Hawaiian Volcano Observatory", url: "https://www.usgs.gov/observatories/hvo", use: "Volcano observations and maps" },
    { name: "USGS National Land Cover Database", url: "https://www.mrlc.gov/data", use: "U.S. land cover" }] },
  iowa: { setting: "Cropland, managed soils and seasonal vegetation", interpretation: "Crop stage, surface moisture and tillage may change backscatter between visits; do not interpret the difference as damage by default.", sources: [
    { name: "USGS National Land Cover Database", url: "https://www.mrlc.gov/data", use: "U.S. land cover" },
    { name: "USDA Cropland Data Layer", url: "https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php", use: "Agricultural cover by year" }] },
  rodanthe: { setting: "Outer Banks barrier island and Atlantic shoreline", interpretation: "Wave action, storms, beach width and water levels complicate radar interpretation. A shoreline-erosion rate requires surveyed or extracted shorelines.", sources: [
    { name: "NOAA Digital Coast", url: "https://coast.noaa.gov/digitalcoast/", use: "Coastal data and shoreline context" },
    { name: "USGS Coastal Change Hazards", url: "https://www.usgs.gov/programs/coastal-and-marine-hazards-and-resources-program", use: "Coastal erosion evidence" }] },
  amazon: { setting: "Tropical river, floodplain and forest", interpretation: "Flooding and vegetation change may alter the return. A water mask needs validation against water level and independent observations.", sources: [
    { name: "ESA WorldCover", url: "https://esa-worldcover.org/", use: "Global land cover products" },
    { name: "JRC Global Surface Water", url: "https://global-surface-water.appspot.com/", use: "Historical surface water occurrence" }] },
  etna: { setting: "Volcanic slopes, rock, lava and vegetation", interpretation: "Changes in surface roughness, geometry and moisture can affect radar signatures; confirming volcanic change requires independent observations.", sources: [
    { name: "INGV Etna Observatory", url: "https://www.ct.ingv.it/", use: "Volcanic activity monitoring" },
    { name: "ESA WorldCover", url: "https://esa-worldcover.org/", use: "Global land cover" }] },
  hubbard: { setting: "Tidewater glacier, mountains and coastal ice", interpretation: "Ice motion and glacier surface conditions require properly aligned radar or optical pairs for quantitative measurement.", sources: [
    { name: "USGS Alaska Science Center", url: "https://www.usgs.gov/centers/alaska-science-center", use: "Glacier and landscape context" },
    { name: "NASA Earth Observatory", url: "https://earthobservatory.nasa.gov/", use: "Published Earth imagery" }] },
  sossusvlei: { setting: "Namib desert sand dunes and dry pans", interpretation: "Dune surface roughness, moisture and radar look angle all influence brightness; image difference does not directly measure sand transport.", sources: [
    { name: "ESA WorldCover", url: "https://esa-worldcover.org/", use: "Global land cover context" },
    { name: "NASA Earthdata", url: "https://www.earthdata.nasa.gov/", use: "Remote-sensing products" }] },
  padma: { setting: "River channels, eroding banks and deposited sandbars", interpretation: "Published Landsat images show channel migration, but deriving riverbank retreat rates requires georeferenced shorelines and ground-truth checks.", sources: [
    { name: "NASA Earth Observatory — Padma River", url: "https://science.nasa.gov/earth/earth-observatory/world-of-change/padma-river/", use: "1988–2018 river change sequence" },
    { name: "JRC Global Surface Water", url: "https://global-surface-water.appspot.com/", use: "Historical surface water context" }] },
};

const KIND: Record<AncillaryLayer["kind"], string> = { population: "Population", land_cover: "Land cover", vegetation: "Vegetation", other: "Context" };

/**
 * Context for a study area: land cover, vegetation and population from independent datasets. Layers appear only when
 * the offline pipeline has produced a validated manifest; otherwise this says plainly that none has been supplied.
 */
export function ContextLayers() {
  const [id, setId] = useState<string>(PLACES[0].id);
  const [states, setStates] = useState<Record<string, State>>({});
  useEffect(() => {
    if (states[id] || !STUDIES.some((s) => s.id === id)) return;
    let live = true;
    const done = (s: State) => { if (live) setStates((p) => ({ ...p, [id]: s })); };
    fetch(dataUrl(`${id}-ancillary/ancillary.json`), { cache: "no-cache" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then((raw) => done(raw ? { status: "ready", layers: parseAncillary(raw, id) } : { status: "none" }))
      .catch(() => done({ status: "invalid" }));
    return () => { live = false; };
  }, [id, states]);
  const study = PLACES.find((p) => p.id === id)!;
  const availableStudy = STUDIES.some(s => s.id === id);
  const context = CONTEXT[id];
  const st: State = availableStudy ? (states[id] ?? { status: "loading" }) : { status: "none" };
  return <section className={styles.section} aria-labelledby="context-title">
    <div className={styles.head}>
      <h2 id="context-title">What surrounds the radar.</h2>
      <p>Radar shows backscatter, not causes. To ask whether people shaped a place, we pair each scene with independent context: land cover, vegetation and population from published datasets.</p>
    </div>
    <div role="tablist" aria-label="Study area" className={styles.tabs}>
      {PLACES.map((s) => <button key={s.id} role="tab" type="button" id={`ctx-tab-${s.id}`} aria-selected={s.id === id} aria-controls="ctx-panel" tabIndex={s.id === id ? 0 : -1} onClick={() => setId(s.id)}
        onKeyDown={(e) => { const i = PLACES.findIndex((x) => x.id === id), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); const n = PLACES[(i + d + PLACES.length) % PLACES.length].id; setId(n); document.getElementById(`ctx-tab-${n}`)?.focus(); } }}>{s.short}</button>)}
    </div>
    <div id="ctx-panel" role="tabpanel" aria-labelledby={`ctx-tab-${id}`} className={styles.panel}>
      <h3>{study.label}</h3>
      {st.status === "loading" && <p role="status" className={styles.muted}>Checking for context layers…</p>}
      {st.status === "invalid" && <p role="alert" className={styles.muted}>A context manifest exists for this place but failed validation, so nothing from it is shown.</p>}
      {context && <div className={styles.contextOverview}>
        <p className={styles.kind}>Landscape and interpretation · source-backed context</p>
        <h4>{context.setting}</h4>
        <p>{context.interpretation}</p>
        <div className={styles.contextLinks}>{context.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><strong>{source.name} ↗</strong><small>{source.use}</small></a>)}</div>
      </div>}
      {st.status === "none" && <div className={styles.empty}>
        <p><strong>Geographic context is ready; quantified layers are not yet published.</strong> Dataset links above open the underlying providers, but no land-cover percentages, vegetation indices or population counts are claimed for this footprint.</p>
        <p>To add validated local figures, download the appropriate georeferenced raster and run <code>pipeline/build_ancillary.py</code>. The site automatically displays a validated <code>ancillary.json</code> when supplied.</p>
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
    <div className={styles.coverage} aria-label="What the current evidence supports">
      <h3>What is available for this location?</h3>
      <ul className={styles.status}>
        <li data-ok={study.kind === "study"}><strong>Two-date comparison:</strong> {study.kind === "study" ? "NISAR HH/HV L-band research pair. See the investigation for validation and QA." : id === "padma" ? "NASA Landsat optical images from 1988 and 2018; not NISAR." : "Published research imagery; the linked investigation identifies instrument and validation limits."}</li>
        <li data-ok="false"><strong>Three-or-more-date series:</strong> Not processed for this location. Additional acquisitions must be checked for matching footprints and quality.</li>
        <li data-ok={id === "padma"}><strong>Other sensor context:</strong> {id === "padma" ? "Landsat 5 and Landsat 8 imagery is available in the separate erosion study." : "Independent dataset links above are available; no additional co-registered sensor measurement has been produced here."}</li>
      </ul>
    </div>
  </section>;
}
