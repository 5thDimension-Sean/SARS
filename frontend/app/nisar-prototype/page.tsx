import type { Metadata } from "next";
import { NisarPrototype } from "@/components/nisar-prototype";

export const metadata: Metadata = {
  title: "NISAR Scientific Evidence | SAR-Waltz",
  description: "Guided exploration of real provisional NASA NISAR HH/HV radar backscatter for the Everglades and Louisiana Delta. Exploratory only; not validated change detection.",
};

export default function NisarPrototypePage() {
  return <NisarPrototype />;
}
