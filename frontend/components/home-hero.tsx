"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STUDIES } from "@/lib/investigation";
import { CesiumGlobe, type StepId } from "./cesium-globe";
import invest from "./investigation/investigation.module.css";
import styles from "./home-hero.module.css";

/** Home page opening: the interactive 3D globe sits beside the headline from the first paint. */
export function HomeHero() {
  const router = useRouter();
  const [flat, setFlat] = useState(false);
  const open = (id: StepId) => { if (id !== "overview") router.push(`/nisar-prototype#${id}`); };
  return <section className={`${invest.hero} ${styles.hero}`} aria-labelledby="home-hero-title">
    <div className={`${invest.heroInner} ${styles.inner}`}>
      <div className={invest.heroCopy}>
        <h1 id="home-hero-title">A different way<br />to see Earth.</h1>
        <p className={invest.heroLead}>NISAR records the microwave energy returned by Earth’s surface. Turn the globe, pick a place, and compare two dates of real radar.</p>
        <Link className={invest.primary} href="/nisar-prototype">Begin the investigation <span aria-hidden="true">↗</span></Link>
        <p className={styles.hint}>Drag to turn the globe · select a marker to open that investigation</p>
      </div>
      <div className={styles.stage}>
        {flat ? <p className={styles.fallback} role="status">The 3D globe needs WebGL, which this browser does not provide. Use the places below.</p>
          : <CesiumGlobe hero active="overview" onPick={open} onUnavailable={() => setFlat(true)} />}
        <p className={styles.credit}>3D globe: CesiumJS · Imagery: Natural Earth II (public domain)</p>
      </div>
    </div>
    <ul className={styles.places} aria-label="Open an investigation">
      {STUDIES.map((s) => <li key={s.id}><Link href={`/nisar-prototype#${s.id}`}>{s.short}</Link></li>)}
    </ul>
  </section>;
}
