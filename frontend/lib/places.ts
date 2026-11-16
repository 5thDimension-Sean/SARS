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
  rodanthe: [-75.50068595795983, 35.529697155479866, -75.4293561222836, 35.640310954737934],
  amazon: [-65.02043484381555, -3.300745697057557, -64.74965756771243, -3.079380346980606],
  hubbard: [-139.43075635339048, 59.99246872773645, -139.17057157354077, 60.20748152795458],
  sossusvlei: [15.199616805860108, -24.850414708223134, 15.40058997730266, -24.649525031875186],
  padma: [89.94525973443696, 23.64606296733649, 90.15441126302902, 23.85387470888398],
  etna: [14.949779196369315, 37.679925039841876, 15.080222045223318, 37.82014462574528],
};
const BLURB: Record<string, string> = {
  everglades: "Slow water and sawgrass wetlands, seen through cloud and night.",
  louisiana: "Where the Mississippi hands its sediment to the Gulf.",
  california: "Steep Big Sur terrain around the 2026 Plaskett fire area.",
  hawaii: "A summit caldera on a restless volcano, two weeks apart.",
  iowa: "Farmland and a university town, three and a half weeks apart.",
  rodanthe: "Storm-period NISAR returns over the Outer Banks; erosion rate not established.",
  hubbard: "Tidewater glacier and mountains, 12 days spanning the December 2025 earthquake. BETA product.",
  sossusvlei: "Dunes and salt pans in one of the driest places on Earth, 12 days apart.",
  padma: "A braided river and its floodplain, 12 days apart. Landsat bank-erosion history is on a separate page.",
  amazon: "Water, forest, and floodplain radar response in the Amazon basin; interpretation exploratory.",
};

const studyPlaces: Place[] = STUDIES.map((s) => {
  const b = FOOTPRINTS[s.id];
  return {
    id: s.id, label: s.label, short: s.short, kind: "study", lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2, bounds: b,
    href: s.id === "rodanthe" ? "/coastal-erosion" : s.id === "amazon" ? "/amazon-river" : `/nisar-prototype#${s.id}`, dates: [s.dates[0], s.dates[1]], blurb: BLURB[s.id] ?? "", tags: ["HH", "HV", "Before / after", "Evidence report"],
  };
});

/** Newer stops from the research branch. Positions are approximate scene centres, used only to aim the camera. */
const researchPlaces: Place[] = [
  { id: "etna", label: "Mount Etna, Sicily", short: "Etna", kind: "research", lon: 15.0, lat: 37.75, bounds: null,
    href: "/etna-investigation", dates: ["2026-07-23", "2026-08-16"],
    blurb: "Europe’s most active volcano, before and after the August 2026 eruptive episode. Official browse images, HH and HV.", tags: ["HH", "HV", "Official browse"] },
];

/** Iowa remains an accessible archived study; Rodanthe takes its featured slot.
 * Amazon is an additional stop and never replaces another location.
 */
export const PLACES: readonly Place[] = [...studyPlaces.filter(p => p.id !== "iowa" && p.id !== "etna"), ...researchPlaces];
export type PlaceId = (typeof PLACES)[number]["id"];
