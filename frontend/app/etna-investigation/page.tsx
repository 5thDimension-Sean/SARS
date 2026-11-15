import type { Metadata } from "next";
import { NisarPrototype } from "@/components/nisar-prototype";

export const metadata: Metadata = {
  title: "Mount Etna: Real NISAR Radar Evidence | TANGO",
  description: "Investigate authentic NASA NISAR HH/HV scenes from July 23 and August 16, 2026 at Mount Etna, with scientific histograms, difference maps, region statistics and QA limits.",
};

export default function EtnaInvestigationPage() {
  return <NisarPrototype studyOverride="etna" />;
}
