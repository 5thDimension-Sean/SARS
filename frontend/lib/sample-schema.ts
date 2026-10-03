export type PhenomenonId = "wetland" | "earthquake" | "forest";
export type Polarization = "HH" | "HV";
export type LayerState = {
  change: boolean;
  boundaries: boolean;
  grid: boolean;
};
export interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  area: number | null;
  provenance: "observed" | "derived" | "sample";
  status: "NOMINAL" | "WARN" | "ALERT";
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
  id: string;
  label: string;
  region: string;
  aliases: string[];
  coordinates: { latitude: number; longitude: number };
  coordinateSource: string;
  coordinateMethod: "reported" | "bounds_midpoint";
  areaKm2: number;
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
export interface SampleDataset {
  schemaVersion: string;
  provenance: "sample";
  nominalRepeatDays: number;
  notes: string[];
  phenomena: Phenomenon[];
}
