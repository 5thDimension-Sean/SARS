import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
import { RadarHero } from "@/components/investigation/radar-hero";
import { StoryMap } from "@/components/story-map";
import { STUDIES } from "@/lib/investigation";
import styles from "@/components/investigation/investigation.module.css";
export const metadata: Metadata = {
  title: "Dancing with SARs | Earth Observation Console",
  description:
    "Explore illustrative wetland, forest, and earthquake surface changes in the Dancing with SARs sample Earth observation dashboard.",
  openGraph: {
    title: "Dancing with SARs | Earth Observation Console",
    description:
      "Compare acquisitions and explore SAR surface changes with clearly labeled sample data.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Dancing with SARs | Earth Observation Console",
    description:
      "An interactive Earth observation console with clearly labeled sample data.",
  },
};
export default function Home() {
  return <>
    <div className={styles.page} style={{ minHeight: 0, paddingBottom: 0 }}>
      <div className={styles.wrap}><RadarHero study={STUDIES[0]} pol="HH" educational /></div>
    </div>
    <StoryMap />
    <section className="sample-lab" aria-labelledby="sample-lab-title"><div className="sample-lab-heading"><h2 id="sample-lab-title">Learn the tools.<br />Then question the evidence.</h2></div><Dashboard /></section>
    <div className={styles.page} style={{ minHeight: 0, paddingBottom: 0 }}>
      <footer className={styles.footer} style={{ marginTop: 0, paddingBottom: 32 }}>
        <span><strong>Disclaimer.</strong> The educational lab above is fictional: its textures, dates, signals and events are illustrative and are not NASA observations. The captioned radar preview at the top is real, exploratory NASA NISAR data that is not cleared for quantitative analysis.</span>
        <span>Dancing with SARs · NASA Space Apps. AI assistance was used for interface design and code; the published radar measurements were preserved.</span>
      </footer>
    </div>
  </>;
}
