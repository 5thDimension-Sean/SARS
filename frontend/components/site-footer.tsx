import styles from "./investigation/investigation.module.css";

/** Shared page footer. The independence disclaimer appears on every page. */
export function SiteFooter({ note }: { note?: string }) {
  return <footer className={styles.footer}>
    <span><strong>Not affiliated with NASA.</strong> Tango is an independent educational project made for the NASA Space Apps Challenge. It is not a NASA product, and NASA does not endorse it. NASA and NISAR data and names belong to their owners and are credited where used.</span>
    {note && <span>{note}</span>}
    <span>Tango · Observe carefully. Interpret cautiously. AI assistance was used for interface design and code; the published radar measurements were preserved.</span>
  </footer>;
}
