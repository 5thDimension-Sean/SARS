import type { Metadata } from "next";
import { FaqPage } from "@/components/faq-page";

export const metadata: Metadata = {
  title: "FAQ | Tango",
  description: "Plain-language answers about radar backscatter, HH and HV, decibels, and what Tango's exploratory comparisons can and cannot show.",
};
export default function Page() { return <FaqPage />; }
