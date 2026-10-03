import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";
export const metadata: Metadata = {
  title: "SAR-Waltz | Earth Observation Console",
  description:
    "Explore illustrative wetland, forest, and earthquake surface changes in the SAR-Waltz sample Earth observation dashboard.",
  openGraph: {
    title: "SAR-Waltz | Earth Observation Console",
    description:
      "Compare acquisitions and explore SAR surface changes with clearly labeled sample data.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SAR-Waltz | Earth Observation Console",
    description:
      "An interactive Earth observation console with clearly labeled sample data.",
  },
};
export default function Home() {
  return <Dashboard />;
}
