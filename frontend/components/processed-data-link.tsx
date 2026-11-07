"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadManifest } from "@/lib/processed-data";
import { assetPath } from "@/lib/site-path";
export function ProcessedDataLink() {
  const [status, setStatus] = useState("Checking offline processed data…");
  useEffect(() => {
    const controller = new AbortController();
    void loadManifest(assetPath("data/manifest.json"), controller.signal).then((m) => {
      if (!controller.signal.aborted) setStatus(m?.frames.length ? `Processed GCOV: ${m.frames.length} frame(s) available. Scientific QA remains unverified.` : "No processed GCOV supplied. Sample mode uses fictional data.");
    }).catch(() => { if (!controller.signal.aborted) setStatus("Processed data could not be loaded or is invalid. Sample mode remains active."); });
    return () => controller.abort();
  }, []);
  return <div className="data-notice" role="status">{status} <Link href="/processed">Processed GCOV</Link> · <Link href="/nisar-prototype">NASA browse imagery</Link></div>;
}
