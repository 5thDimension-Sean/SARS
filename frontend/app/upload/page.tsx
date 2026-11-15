import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/investigation/investigation.module.css";

export const metadata: Metadata = { title: "Coordinates | TANGO" };
export default function Page() {
  return <main className={styles.page}><div className={styles.wrap}>
    <section className={styles.section} style={{ paddingTop: 120 }}>
      <h1>Investigate using coordinates</h1>
      <p className={styles.lead}>TANGO no longer asks you to upload images. Visit the coordinate explorer to use real NASA NISAR observations.</p>
      <p style={{ marginTop: 20 }}><Link href="/coordinates">Open the coordinate explorer</Link></p>
    </section>
  </div></main>;
}
