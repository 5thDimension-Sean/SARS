import type { Metadata } from "next";
import { GlobeJourney } from "@/components/globe-journey";
import { ContextLayers } from "@/components/context-layers";

export const metadata: Metadata = {
  title: "Tango | Our Golden Record",
  description: "Scroll from orbit to places around the world and compare two dates of real NASA NISAR radar. Exploratory, educational, and clearly labeled.",
  openGraph: { title: "Tango | Our Golden Record", description: "Compare two dates of real radar, place by place.", type: "website" },
  twitter: { card: "summary", title: "Tango | Our Golden Record", description: "An educational radar explorer with clearly labeled data." },
};

export default function Home() {
  return <>
    <GlobeJourney />
    <ContextLayers />
  </>;
}
