import type { Metadata } from "next";
import { NisarPrototype } from "@/components/nisar-prototype";

export const metadata: Metadata = {
  title: "Amazon River NISAR Scientific Evidence | TANGO",
  description: "Examine real NASA NISAR HH/HV observations from the Mamirauá Amazon floodplain, July 7 and 19, 2026, using the same scientific workbench as the Everglades.",
};
export default function AmazonRiverPage() { return <NisarPrototype studyOverride="amazon" />; }
