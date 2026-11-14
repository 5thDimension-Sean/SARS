import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import Link from "next/link";
import { RadarHero } from "@/components/investigation/radar-hero";
import { STUDIES, QA_LABEL } from "@/lib/investigation";
import styles from "@/components/investigation/investigation.module.css";
export const metadata: Metadata = {
  title: "SAR-Waltz | Earth Observation Console",
  description:
    "Explore illustrative wetland, forest, and earthquake surface changes in the SAR-Waltz sample Earth observation dashboard.",
  openGraph: {
    title: "SAR-Waltz | Earth Observation Console",
    description:
      "Compare acquisitions and explore SAR surface changes with clearly labeled sample data.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SAR-Waltz | Earth Observation Console",
    description:
      "An interactive Earth observation console with clearly labeled sample data.",
  },
};
export default function Home() {
  return <>
    <div className={styles.page}>
      <header className={styles.topbar}><span className={styles.brand}>SAR—Waltz</span><span className={styles.qaChip}><code>{QA_LABEL}</code></span><Link className={styles.demoLink} href="/nisar-prototype">Real NISAR evidence ↗</Link></header>
      <div className={styles.wrap}><RadarHero study={STUDIES[0]} pol="HH" educational /></div>
    </div>
    <section className="sample-lab" aria-labelledby="sample-lab-title"><div className="sample-lab-heading"><h2 id="sample-lab-title">Learn the tools.<br />Then question the evidence.</h2><p><strong>FICTIONAL EDUCATIONAL DEMO.</strong> All lab textures, dates, signals and events below are illustrative. They are not NASA observations. <Link href="/nisar-prototype">Open the real NISAR investigation ↗</Link></p><p>AI assistance was used for interface design and code. The captioned NASA radar previews retain the published measurements.</p></div><Dashboard /></section>
  </>;
}
