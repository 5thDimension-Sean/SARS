import type { Metadata } from "next";
import { NisarPrototype } from "@/components/nisar-prototype";

export const metadata: Metadata = {
  title: "Everglades NISAR prototype | SAR-Waltz",
  description: "Authentic provisional NASA NISAR browse imagery. Visual comparison only; no scientific change measurements.",
};

export default function NisarPrototypePage() {
  return <NisarPrototype />;
}
