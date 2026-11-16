import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/investigation/investigation.module.css";

export const metadata: Metadata = { title: "Coordinates | TANGO" };
export default function Page() {
  return <main className={styles.page}><div className={styles.wrap}>
    <section className={styles.section} style={{ paddingTop: 120 }}>
      <h1>Explore real NISAR places</h1>
      <p className={styles.lead}>TANGO does not take uploads. Explore the real NASA NISAR comparisons instead.</p>
      <p style={{ marginTop: 20 }}><Link href="/research-preview">Open the places</Link></p>
    </section>
  </div></main>;
}
