import type { Metadata } from "next";
import { ResearchPreview } from "@/components/research-preview";

export const metadata: Metadata = {
  title: "Worldwide Research Preview | Dancing with SARs",
  description: "Internal review of published NISAR observations and worldwide event candidates. Exploratory and not scientifically cleared.",
  robots: { index: false, follow: false },
};
export default function ResearchPreviewPage() {
  return <ResearchPreview />;
}
