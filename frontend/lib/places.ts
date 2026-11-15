import everglades from "../public/data/everglades-preview/preview-manifest.json" with { type: "json" };
import louisiana from "../public/data/louisiana-preview/preview-manifest.json" with { type: "json" };
import california from "../public/data/california-preview/preview-manifest.json" with { type: "json" };
import { STUDIES, type Bounds } from "./investigation.ts";

/** One stop on the home-page globe journey. Study stops open an investigation; research stops open the research preview. */
export interface Place {
  id: string; label: string; short: string; kind: "study" | "research";
  lon: number; lat: number;
  /** Footprint of the published scene, when one is known. Research stops show a point only. */
  bounds: Bounds | null;
  href: string; dates: [string, string]; blurb: string; tags: string[];
}

const FOOTPRINTS: Record<string, Bounds> = {
  everglades: everglades.bounds as Bounds,
  louisiana: louisiana.bounds as Bounds,
  california: california.bounds as Bounds,
  hawaii: [-155.29, 19.39, -155.25, 19.43],
  iowa: [-93.64, 42.0, -93.6, 42.04],
};
const BLURB: Record<string, string> = {
  everglades: "Slow water and sawgrass wetlands, seen through cloud and night.",
  louisiana: "Where the Mississippi hands its sediment to the Gulf.",
  california: "Steep Big Sur terrain around the 2026 Plaskett fire area.",
  hawaii: "A summit caldera on a restless volcano, two weeks apart.",
  iowa: "Farmland and a university town, three and a half weeks apart.",
};

const studyPlaces: Place[] = STUDIES.map((s) => {
  const b = FOOTPRINTS[s.id];
  return {
    id: s.id, label: s.label, short: s.short, kind: "study", lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2, bounds: b,
    href: `/nisar-prototype#${s.id}`, dates: [s.dates[0], s.dates[1]], blurb: BLURB[s.id] ?? "", tags: ["HH", "HV", "Before / after", "Evidence report"],
  };
});

/** Newer stops from the research branch. Positions are approximate scene centres, used only to aim the camera. */
const researchPlaces: Place[] = [
  { id: "hubbard", label: "Hubbard Glacier, Alaska", short: "Hubbard", kind: "research", lon: -139.3, lat: 60.1, bounds: null,
    href: "/research-preview#hubbard", dates: ["2025-11-26", "2025-12-08"],
    blurb: "NASA’s published radar pair around the December 2025 earthquake in the St. Elias Mountains.", tags: ["NASA-published pair", "Before / after", "Sources"] },
  { id: "sossusvlei", label: "Sossusvlei, Namibia", short: "Sossusvlei", kind: "research", lon: 15.3, lat: -24.75, bounds: null,
    href: "/research-preview#sossusvlei", dates: ["2026-10-07", "2026-10-19"],
    blurb: "Dunes and salt pans in one of the driest places on Earth. Official browse images, HH and HV.", tags: ["HH", "HV", "Official browse"] },
  { id: "etna", label: "Mount Etna, Sicily", short: "Etna", kind: "research", lon: 15.0, lat: 37.75, bounds: null,
    href: "/research-preview#etna", dates: ["2026-07-23", "2026-08-16"],
    blurb: "Europe’s most active volcano, before and after the August 2026 eruptive episode. Official browse images, HH and HV.", tags: ["HH", "HV", "Official browse"] },
];

export const PLACES: readonly Place[] = [...studyPlaces, ...researchPlaces];
export type PlaceId = (typeof PLACES)[number]["id"];
