import type { Metadata } from "next";
import Link from "next/link";
import { PadmaErosionStory } from "@/components/padma-erosion-story";

export const metadata: Metadata = {
  title: "Padma River Erosion | TANGO",
  description: "Explore NASA Landsat images from 1988 and 2018 documenting Padma River riverbank erosion in Bangladesh. Independent optical evidence; no NISAR measurements claimed.",
};

export default function PadmaErosionPage() {
  return <main>
    <PadmaErosionStory />
    <footer style={{ maxWidth: 1100, padding: "2rem 1.25rem 4rem", margin: "auto" }}>
      <Link href="/">← Return to the TANGO globe</Link>
    </footer>
  </main>;
}
