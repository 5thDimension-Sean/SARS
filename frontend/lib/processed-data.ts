// Runtime boundary for offline pipeline assets. Never accept arbitrary URLs from a manifest.
export type Pol = "HH" | "HV";
type Range = [number, number];
export interface ProcessedAcquisition {
  date: string; productVersion: string; compositeReleaseId: string; dataMaturity: string;
  sourceFile: string; orbit: number; pols: Pol[];
  overlays: Partial<Record<Pol, string>>; cog: Partial<Record<Pol, string>>;
  statisticsDb: Partial<Record<Pol, { mean: number | null; min: number | null; max: number | null; validPixelCount: number }>>;
  histogramDb: Partial<Record<Pol, { edges: number[]; counts: number[]; normalized: number[] }>>;
}
export interface ProcessedFrame {
  id: string; label: string; track: number; frame: number; passDirection: string;
  bounds: [number, number, number, number]; overlaySize: [number, number];
  acquisitions: ProcessedAcquisition[];
}
export interface ProcessedManifest {
  schemaVersion: string; provenance: "derived"; source: string; generated: string;
  frames: ProcessedFrame[]; dbRanges: Partial<Record<Pol, Range>>; processingNotes: string[];
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected an object");
  return v as Record<string, unknown>;
};
const string = (v: unknown) => { if (typeof v !== "string" || !v.trim() || v.length > 4000) throw new Error("Missing or invalid text"); return v; };
const number = (v: unknown) => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Invalid number"); return v; };
const integer = (v: unknown) => { const n = number(v); if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid count"); return n; };
const list = (v: unknown): unknown[] => { if (!Array.isArray(v) || v.length > 10000) throw new Error("Invalid list"); return v; };
const tuple = (v: unknown, length: number): number[] => { const a = list(v).map(number); if (a.length !== length) throw new Error("Invalid geometry"); return a; };
const date = (v: unknown) => { const s = string(v); if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error("Invalid UTC date"); return s; };
export function safeAsset(v: unknown): string {
  const path = string(v);
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:png|webp|jpg|tif|json)$/.test(path) || path.split("/").some((s) => s === "." || s === "..")) throw new Error("Unsafe asset path");
  return path;
}
function assets(v: unknown): Partial<Record<Pol, string>> {
  const input = object(v ?? {}), result: Partial<Record<Pol, string>> = {};
  for (const pol of ["HH", "HV"] as const) if (input[pol] !== undefined) result[pol] = safeAsset(input[pol]);
  return result;
}
export function parseManifest(raw: unknown): ProcessedManifest {
  const m = object(raw);
  if (m.schemaVersion !== "1.0" || m.provenance !== "derived" || m.dryRun === true) throw new Error("Expected a processed GCOV manifest, not a sample or dry run");
  const dbRanges: ProcessedManifest["dbRanges"] = {};
  const ranges = object(m.dbRanges);
  for (const pol of ["HH", "HV"] as const) if (ranges[pol] !== undefined) {
    const r = tuple(ranges[pol], 2) as Range; if (r[0] >= r[1]) throw new Error("Invalid display range"); dbRanges[pol] = r;
  }
  const frames = list(m.frames).map((rawFrame): ProcessedFrame => {
    const f = object(rawFrame), bounds = tuple(f.bounds, 4) as ProcessedFrame["bounds"];
    const size = tuple(f.overlaySize, 2) as [number, number];
    if (f.crs !== "EPSG:4326" || f.overlayCrs !== "EPSG:3857" || bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -85.051129 || bounds[3] > 85.051129 || size.some((n) => n <= 0 || n > 8192 || !Number.isInteger(n))) throw new Error("Invalid raster geometry");
    tuple(f.overlayTransform, 6);
    if (f.passDirection !== "ASCENDING" && f.passDirection !== "DESCENDING") throw new Error("Invalid orbit direction");
    const acquisitions = list(f.acquisitions).map((rawAcquisition): ProcessedAcquisition => {
      const a = object(rawAcquisition);
      if (a.productType !== "GCOV") throw new Error("Only GCOV is supported");
      const pols = list(a.pols).map((p) => { if (p !== "HH" && p !== "HV") throw new Error("Invalid polarization"); return p; });
      if (!pols.length || new Set(pols).size !== pols.length) throw new Error("Missing or duplicate polarization");
      const overlays = assets(a.overlays), cog = assets(a.cog), statisticsDb: ProcessedAcquisition["statisticsDb"] = {}, histogramDb: ProcessedAcquisition["histogramDb"] = {};
      for (const pol of pols) {
        if (!overlays[pol] || !dbRanges[pol]) throw new Error("Missing raster or display range");
        const s = object(object(a.statisticsDb)[pol]), h = object(object(a.histogramDb)[pol]);
        const nullable = (v: unknown) => v === null ? null : number(v);
        const stats = { mean: nullable(s.mean), min: nullable(s.min), max: nullable(s.max), validPixelCount: integer(s.validPixels) };
        if ((stats.validPixelCount === 0 && [stats.mean, stats.min, stats.max].some((v) => v !== null)) || (stats.validPixelCount > 0 && (stats.mean === null || stats.min === null || stats.max === null || stats.min > stats.mean || stats.mean > stats.max))) throw new Error("Inconsistent statistics");
        const edges = list(h.binEdges).map(number), counts = list(h.counts).map(integer), normalized = list(h.normalized).map(number);
        if (!counts.length || edges.length !== counts.length + 1 || normalized.length !== counts.length || edges.some((n, i) => i > 0 && n <= edges[i - 1]) || normalized.some((n) => n < 0 || n > 1)) throw new Error("Invalid histogram");
        if (counts.reduce((sum, count) => sum + count, 0) > stats.validPixelCount || normalized.some((fraction, i) => Math.abs(fraction - (stats.validPixelCount ? counts[i] / stats.validPixelCount : 0)) > 1e-8)) throw new Error("Histogram does not match valid-pixel statistics");
        statisticsDb[pol] = stats; histogramDb[pol] = { edges, counts, normalized };
      }
      return { date: date(a.date), productVersion: string(a.productVersion), compositeReleaseId: string(a.compositeReleaseId), dataMaturity: string(a.dataMaturity), sourceFile: string(a.sourceFile), orbit: integer(a.orbit), pols, overlays, cog, statisticsDb, histogramDb };
    });
    if (!acquisitions.length || acquisitions.some((a, i) => i > 0 && (Date.parse(a.date) <= Date.parse(acquisitions[i - 1].date) || a.date.slice(0, 10) === acquisitions[i - 1].date.slice(0, 10)))) throw new Error("Acquisitions must have distinct, ordered dates");
    return { id: string(f.id), label: string(f.label), track: integer(f.track), frame: integer(f.frame), passDirection: f.passDirection, bounds, overlaySize: size, acquisitions };
  });
  if (new Set(frames.map((f) => f.id)).size !== frames.length) throw new Error("Duplicate frame");
  return { schemaVersion: "1.0", provenance: "derived", source: string(m.source), generated: date(m.generated), dbRanges, frames, processingNotes: list(m.processingNotes).map(string) };
}
export async function loadManifest(url: string, signal: AbortSignal): Promise<ProcessedManifest | null> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Processed data request failed");
  return parseManifest(await response.json());
}
