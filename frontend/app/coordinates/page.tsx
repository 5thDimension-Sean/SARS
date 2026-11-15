"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PLACES } from "@/lib/places";
import { SiteFooter } from "@/components/site-footer";
import styles from "@/components/investigation/investigation.module.css";

const STUDIES = PLACES.filter((p) => p.kind === "study" && p.bounds);
const validLatitude = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLongitude = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;

export default function LocationExplorer() {
  const [lat, setLat] = useState("25.9");
  const [lon, setLon] = useState("-80.8");
  const [start, setStart] = useState("2026-09-01");
  const [end, setEnd] = useState("2026-10-31");
  const latitude = Number(lat), longitude = Number(lon);
  const valid = lat.trim() !== "" && lon.trim() !== "" && validLatitude(latitude) && validLongitude(longitude) && !!start && !!end && start <= end;
  const matches = useMemo(() => valid ? STUDIES.filter((p) => {
    const b = p.bounds!;
    return longitude >= b[0] && longitude <= b[2] && latitude >= b[1] && latitude <= b[3] && p.dates[0] >= start && p.dates[1] <= end;
  }) : [], [valid, latitude, longitude, start, end]);
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <section className={styles.section} style={{ paddingTop: "clamp(40px, 8vw, 96px)" }}>
        <header><h1 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", letterSpacing: "-.05em" }}>Explore by coordinates</h1>
          <p className={styles.lead}>Enter a latitude, longitude, and date interval. TANGO checks whether a published two-date NISAR comparison covers that point and interval. Only compatible, preprocessed scenes can show a real difference.</p></header>
        <form onSubmit={(e) => e.preventDefault()} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 16, marginTop: 24 }}>
          <label>Latitude (-90 to 90)<input className={styles.search} type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
          <label>Longitude (-180 to 180)<input className={styles.search} type="number" step="any" min="-180" max="180" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
          <label>From date<input className={styles.search} type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></label>
          <label>To date<input className={styles.search} type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
        </form>
        <div role="status" aria-live="polite" style={{ marginTop: 24 }}>
          {!valid ? <p className={styles.notice}>Enter valid coordinates and a date interval with the start on or before the end.</p> :
            matches.length ? <div className={styles.notice}><strong>{matches.length} published comparison{matches.length === 1 ? "" : "s"} available for this point.</strong>
              {matches.map((p) => <p key={p.id}><Link href={p.href}>Open {p.label}: {p.dates[0]} to {p.dates[1]} (exploratory difference)</Link></p>)}</div> :
            <p className={styles.notice}>No published, compatible NISAR comparison covers these coordinates and both acquisition dates within this interval. No difference or erosion claim can be calculated here yet. Try one of the sample coordinates below, or expand the interval.</p>}
        </div>
        <div style={{ marginTop: 24 }}>
          <h2>Available real radar scenes</h2>
          <p className={styles.lead}>Choose a scene to fill its center coordinates and actual acquisition dates.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {STUDIES.map((p) => <button key={p.id} type="button" className={styles.chip} onClick={() => { setLat(String(p.lat)); setLon(String(p.lon)); setStart(p.dates[0]); setEnd(p.dates[1]); }}>{p.short}</button>)}
          </div>
        </div>
        <div className={styles.notice} style={{ marginTop: 24 }}>
          <strong>Why not every location?</strong> The public site is static. It cannot request Earthdata credentials, download raw HDF5 scenes, coregister comparable acquisitions, or produce verified differences on demand. A future backend could do that; this tool checks actual published coverage instead of fabricating an image. Backscatter change is not a measurement of coastal erosion.
        </div>
      </section>
      <SiteFooter />
    </div>
  </main>;
}
