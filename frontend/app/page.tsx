import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import { GlobeJourney } from "@/components/globe-journey";
import { ContextLayers } from "@/components/context-layers";
import { SiteFooter } from "@/components/site-footer";
import styles from "@/components/investigation/investigation.module.css";
export const metadata: Metadata = {
  title: "Tango | Our Golden Record",
  description: "Scroll from orbit to places around the world and compare two dates of real NASA NISAR radar. Exploratory, educational, and clearly labeled.",
  openGraph: { title: "Tango | Our Golden Record", description: "Compare two dates of real radar, place by place.", type: "website" },
  twitter: { card: "summary", title: "Tango | Our Golden Record", description: "An educational radar explorer with clearly labeled data." },
};
export default function Home() {
  return <>
    <GlobeJourney />
    <ContextLayers />
    <section className="sample-lab" aria-labelledby="sample-lab-title"><div className="sample-lab-heading"><h2 id="sample-lab-title">Learn the tools.<br />Then question the evidence.</h2></div><Dashboard /></section>
    <div className={styles.page} style={{ minHeight: 0, paddingBottom: 0 }}>
      <div className={styles.wrap}>
        <SiteFooter note="The educational lab above is fictional: its textures, dates, signals and events are illustrative and are not NASA observations. The radar previews inside each investigation are real, exploratory NASA NISAR data that is not cleared for quantitative analysis." />
      </div>
    </div>
  </>;
}
