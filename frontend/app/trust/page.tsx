import type { Metadata } from "next";
import { TrustPanel } from "@/components/trust-panel";

export const metadata: Metadata = {
  title: "Trust layer | SAR-Waltz",
  description: "Evidence checklist and background false-alarm context for provisional NASA NISAR radar changes. Not a confidence score.",
};

export default function TrustPage() {
  return <TrustPanel />;
}
