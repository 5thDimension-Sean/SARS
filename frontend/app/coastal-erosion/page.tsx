import type { Metadata } from "next";
import { NisarPrototype } from "@/components/nisar-prototype";

export const metadata: Metadata = {
  title: "Rodanthe NISAR Scientific Evidence | TANGO",
  description: "Explore authentic September 17 and 29, 2026 NISAR HH/HV backscatter before and after the Outer Banks storm, with the same analysis and quality controls as the Everglades.",
};
export default function CoastalErosionPage() { return <NisarPrototype studyOverride="rodanthe" />; }
