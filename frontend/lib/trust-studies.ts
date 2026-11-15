// Which locations the trust layer knows about, and what each can honestly support.
//
// "grid" studies publish regions.json + evidence.json (and, once the offline pipeline has exported it,
// difference-grid.json). "none" locations have no processed NISAR pair, so the page can only say so.
// Every published *-regions folder must appear here; scripts/trust-studies.test.mjs enforces that so a newly
// added location can never silently skip the trust layer.

export interface GridStudy {
  kind: "grid"; id: string; label: string; evidenceDir: string; regionsDir: string;
  /** Tile size and step the region-selection step used, when the generator documents it. */
  selection: { window: number; step: number } | null;
}
export interface NoNisarLocation {
  kind: "none"; id: string; label: string; reason: string; independent: string[];
}
export type TrustLocation = GridStudy | NoNisarLocation;

const grid = (id: string, label: string, dir: string, selection: GridStudy["selection"]): GridStudy =>
  ({ kind: "grid", id, label, evidenceDir: `${dir}-evidence`, regionsDir: `${dir}-regions`, selection });

export const TRUST_LOCATIONS: readonly TrustLocation[] = [
  grid("everglades", "Everglades, Florida", "everglades", { window: 80, step: 40 }),
  grid("louisiana", "Louisiana Delta", "louisiana", { window: 80, step: 40 }),
  grid("california", "Big Sur, California", "california", { window: 80, step: 40 }),
  grid("rodanthe", "Rodanthe, North Carolina", "rodanthe", { window: 64, step: 32 }),
  grid("amazon", "Mamirauá, Amazon", "amazon", { window: 64, step: 32 }),
  grid("hawaii", "Hawaiʻi summit", "hawaii-full", { window: 64, step: 32 }),
  grid("etna", "Mount Etna, Sicily", "etna-event", { window: 64, step: 32 }),
  // Visitor-selected coordinate, written by pipeline/generate_unified_evidence.py --site custom when it has run.
  grid("custom", "Your own coordinate", "custom", { window: 64, step: 32 }),
  { kind: "none", id: "padma", label: "Padma River, Bangladesh",
    reason: "This location is documented with NASA Landsat optical images from 1988 and 2018. No NISAR product pair has been processed, and optical images cannot be turned into radar backscatter.",
    independent: ["NASA Landsat 5 and 8 images, 1988 and 2018", "NASA Earth Observatory's published erosion history"] },
  { kind: "none", id: "hubbard", label: "Hubbard Glacier, Alaska",
    reason: "Only NASA's published radar visualizations are shown. They are publisher composites, not numerical HH/HV grids, so no difference can be measured.",
    independent: [] },
  { kind: "none", id: "sossusvlei", label: "Sossusvlei, Namibia",
    reason: "Only official HH and HV browse images are shown. Image brightness is not a calibrated temporal difference, so no numbers can be computed.",
    independent: [] },
];

export const DEFAULT_LOCATION = "louisiana";
export const findLocation = (id: string): TrustLocation | undefined => TRUST_LOCATIONS.find((l) => l.id === id);
