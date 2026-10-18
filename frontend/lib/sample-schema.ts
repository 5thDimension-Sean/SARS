export type PhenomenonId = "wetland" | "earthquake" | "forest" | "gcov";
export type Polarization = "HH" | "HV";
export type Provenance = "observed" | "derived" | "sample";
export type GeographicBounds = [number, number, number, number];
export interface HistogramDistribution {
  binEdges: number[];
  counts: number[];
  normalized: number[];
}
export interface ChangeLayer {
  from: string;
  to: string;
  type: "dbDiff" | "hvhhDiff";
  pol?: Polarization;
  url: string;
}
export type LayerState = {
  change: boolean;
  boundaries: boolean;
  grid: boolean;
};
export interface Metric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  area: number | null;
  provenance: "observed" | "derived" | "sample";
  status: "NOMINAL" | "WARN" | "ALERT";
  note?: string;
}
export interface HistogramBin {
  db: number;
  HH: number;
  HV: number;
}
export interface ProfilePoint {
  distanceKm: number;
  displacementCm: number;
}
export interface Acquisition {
  provenance?: "sample" | "derived";
  source?: string;
  histogramDb?: Partial<Record<Polarization, HistogramDistribution>>;
  dbRanges?: Partial<Record<Polarization, [number, number]>>;
  cogUrls?: Partial<Record<Polarization, string>>;
  roiGridUrls?: Partial<Record<Polarization,string>>;
  optical?: {url:string;date:string;source:string;credit:string};
  date: string;
  referenceDate: string;
  backscatterNormalization: "gamma0";
  histogramOrdinateUnit: "%";
  areaUnit: "km²";
  displacementSign: "positive_toward_sensor";
  productType: "GCOV" | "GUNW";
  polarization: Polarization[];
  orbit: number;
  frame: number;
  passDirection: "ASCENDING" | "DESCENDING";
  productVersion: string;
  compositeReleaseId?: string;
  dataMaturity?: string;
  histogramBinsDb: HistogramBin[];
  displacementProfileCm: ProfilePoint[];
  metrics: Metric[];
  insight: string;
  layerUrls: {
    HH: string | null;
    HV: string | null;
    displacement: string | null;
  };
  tileUrl: string | null;
}
export interface Hotspot {
  provenance?: "sample" | "derived";
  bounds?: GeographicBounds;
  track?: number;
  changeLayers?: ChangeLayer[];
  changeRangeDb?: [number, number];
  colorMaps?: {
    backscatter: "gray" | "viridis";
    change: "RdBu_r" | "coolwarm";
  };
  processingNotes?: string[];
  id: string;
  label: string;
  region: string;
  aliases: string[];
  coordinates: { latitude: number; longitude: number };
  coordinateSource: string;
  coordinateMethod: "reported" | "bounds_midpoint";
  areaKm2: number | null;
  textureSeed: number;
  acquisitions: Acquisition[];
  events: { date: string; label: string; status: "WARN" | "ALERT" }[];
}
export interface Phenomenon {
  id: PhenomenonId;
  label: string;
  shortLabel: string;
  description: string;
  analysis: "backscatter" | "displacement";
  explanation: string;
  limitation: string;
  locations: Hotspot[];
}
export interface DashboardDataset {
  schemaVersion: string;
  provenance: "sample" | "derived" | "mixed";
  nominalRepeatDays: number;
  notes: string[];
  phenomena: Phenomenon[];
}
export interface SampleDataset extends DashboardDataset {
  provenance: "sample";
}
