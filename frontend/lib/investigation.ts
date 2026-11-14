// Data contracts, validation and plain-language helpers for the Scientific Evidence viewer.
// Nothing here fabricates measurements: every number shown in the UI is read from the published
// evidence/regions/preview JSON files and re-validated for internal consistency first.

export type Pol = "HH" | "HV";
export const POLS: readonly Pol[] = ["HH", "HV"];
export type Pair<T> = readonly [T, T];
export type LonLat = [number, number];
export type Bounds = [number, number, number, number]; // west, south, east, north

export interface StudyConfig {
  id: "everglades" | "louisiana";
  label: string;
  place: string;
  evidenceDir: string;
  regionsDir: string;
  /** Georeferenced single-date HH/HV previews. null = none published for this study. */
  previewDir: string | null;
  /** NASA GIBS browse mosaic has been probed for these exact dates; only then is it used as context. */
  gibsContext: boolean;
  dates: Pair<string>;
  granules: Pair<string>;
  utmZone: number;
}

export const STUDIES: readonly StudyConfig[] = [
  { id: "everglades", label: "Everglades, Florida", place: "Florida Everglades", evidenceDir: "everglades-evidence",
    regionsDir: "everglades-regions", previewDir: "everglades-preview", gibsContext: true,
    dates: ["2026-09-30", "2026-10-12"], granules: ["G4342506513-ASF", "G4373929961-ASF"], utmZone: 17 },
  { id: "louisiana", label: "Louisiana Delta", place: "Louisiana Mississippi River Delta", evidenceDir: "louisiana-evidence",
    regionsDir: "louisiana-regions", previewDir: null, gibsContext: false,
    dates: ["2026-09-29", "2026-10-11"], granules: ["G4330259432-ASF", "G4361359332-ASF"], utmZone: 15 },
];

export const QA_LABEL = "EXPLORATORY_NOT_CLEARED";
export const NO_CAUSE_NOTICE = "Radar differences do not establish flooding, vegetation loss, or damage.";

export function dataUrl(path: string, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""): string {
  if (/(^|\/)\.\.(\/|$)/.test(path) || path.startsWith("/") || /^[a-z]+:/i.test(path)) throw new Error("Unsafe data path");
  return `${basePath.replace(/\/$/, "")}/data/${path}`;
}

// ---------------------------------------------------------------- evidence.json
export interface Observation {
  date: string; granuleId: string; count: number;
  meanDb: number; medianDb: number; stdDb: number; p05Db: number; p95Db: number; outsideDisplayRange: number;
}
export interface HistogramBin { lowDb: number; highDb: number; counts: Pair<number> }
export interface PolEvidence {
  observations: Pair<Observation>;
  differenceOfRegionalMeansDb: number;
  differenceOfRegionalMediansDb: number;
  bins: HistogramBin[];
  histogramImage: string;
}
export interface Evidence {
  title: string; studyArea: string; provenance: string; measurement: string;
  scientificClearance: string;
  quality: [string, string][];
  limitations: string[];
  dates: Pair<string>;
  pols: Record<Pol, PolEvidence>;
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Invalid number: ${what}`);
  return v;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Invalid text: ${what}`);
  return v;
};
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const QA_LABELS: Record<string, string> = {
  identificationGroup: "Product identification group",
  frequencyAHHAndHVValidity: "HH/HV validity (Frequency A)",
  gridAlignment: "Grid alignment",
  radiometricArtifactsAndNoise: "Radiometric artifacts and noise (RFI, banding)",
};
export const qaLabel = (key: string) => QA_LABELS[key] ?? key;

/** "FAIL"/"UNVERIFIED"/"PASS" prefix drives the visual state; the full sentence is always shown. */
export function qaState(text: string): "pass" | "fail" | "unverified" {
  const head = text.trim().toUpperCase();
  if (head.startsWith("PASS")) return "pass";
  if (head.startsWith("FAIL")) return "fail";
  return "unverified";
}

function parseObservation(v: unknown, study: StudyConfig, i: 0 | 1, pol: Pol): Observation {
  if (!isRec(v)) throw new Error(`Missing ${pol} observation`);
  const o: Observation = {
    date: str(v.date, "date"), granuleId: str(v.granuleId, "granuleId"), count: num(v.count, "count"),
    meanDb: num(v.meanDb, "meanDb"), medianDb: num(v.medianDb, "medianDb"), stdDb: num(v.stdDb, "stdDb"),
    p05Db: num(v.p05Db, "p05Db"), p95Db: num(v.p95Db, "p95Db"), outsideDisplayRange: num(v.outsideDisplayRange, "outside"),
  };
  if (o.date !== study.dates[i] || o.granuleId !== study.granules[i]) throw new Error(`${pol} observation does not match ${study.label} acquisition ${i + 1}`);
  if (!(o.count > 0) || !(o.p05Db <= o.medianDb && o.medianDb <= o.p95Db) || !(o.stdDb >= 0)) throw new Error(`${pol} statistics are internally inconsistent`);
  return o;
}

export function parseEvidence(value: unknown, study: StudyConfig): Evidence {
  if (!isRec(value) || !isRec(value.polarizations) || !isRec(value.quality)) throw new Error("Evidence file is malformed");
  const dates = value.dates;
  if (!Array.isArray(dates) || dates[0] !== study.dates[0] || dates[1] !== study.dates[1]) throw new Error("Evidence dates do not match study");
  const pols = {} as Record<Pol, PolEvidence>;
  for (const pol of POLS) {
    const p = value.polarizations[pol];
    if (!isRec(p) || !Array.isArray(p.observations) || p.observations.length !== 2 || !Array.isArray(p.histogramBins) || !p.histogramBins.length) {
      throw new Error(`Missing ${pol} evidence`);
    }
    const observations: Pair<Observation> = [parseObservation(p.observations[0], study, 0, pol), parseObservation(p.observations[1], study, 1, pol)];
    // Louisiana names the count fields via a date map; Everglades uses sep30Count/oct12Count.
    const map = isRec(p.histogramBinCountFieldByDate) ? p.histogramBinCountFieldByDate : null;
    const first = (p.histogramBins[0] ?? {}) as Record<string, unknown>;
    const legacy = Object.keys(first).filter((k) => k.endsWith("Count"));
    const fields = map ? [map[study.dates[0]], map[study.dates[1]]] : legacy;
    if (fields.length !== 2 || !fields.every((f) => typeof f === "string" && f in first) || fields[0] === fields[1]) throw new Error(`${pol} histogram count fields are ambiguous`);
    const bins = (p.histogramBins as unknown[]).map((b): HistogramBin => {
      if (!isRec(b)) throw new Error("Invalid histogram bin");
      const low = num(b.lowDb, "lowDb"), high = num(b.highDb, "highDb");
      const counts: Pair<number> = [num(b[fields[0] as string], "count"), num(b[fields[1] as string], "count")];
      if (!(high > low) || counts.some((c) => c < 0)) throw new Error("Invalid histogram bin");
      return { lowDb: low, highDb: high, counts };
    });
    // Every retained pixel is either in a bin or counted as outside the fixed display range.
    for (const i of [0, 1] as const) {
      const total = bins.reduce((s, b) => s + b.counts[i], 0);
      if (total + observations[i].outsideDisplayRange !== observations[i].count) throw new Error(`${pol} histogram does not reconcile with pixel count`);
    }
    const dMedian = num(p.differenceOfRegionalMediansDb, "median difference");
    const dMean = num(p.differenceOfRegionalMeansDb, "mean difference");
    if (!near(dMedian, observations[1].medianDb - observations[0].medianDb, 1e-3) || !near(dMean, observations[1].meanDb - observations[0].meanDb, 1e-3)) {
      throw new Error(`${pol} published differences do not match the per-date statistics`);
    }
    pols[pol] = { observations, differenceOfRegionalMeansDb: dMean, differenceOfRegionalMediansDb: dMedian, bins, histogramImage: str(p.histogramImage, "histogramImage") };
  }
  return {
    title: str(value.title, "title"), studyArea: str(value.studyArea, "studyArea"), provenance: str(value.provenance, "provenance"),
    measurement: str(value.measurement, "measurement"), scientificClearance: str(value.scientificClearance, "scientificClearance"),
    quality: Object.entries(value.quality).map(([k, v]) => [k, str(v, k)] as [string, string]),
    limitations: Array.isArray(value.limitations) ? value.limitations.map((l) => str(l, "limitation")) : [],
    dates: [study.dates[0], study.dates[1]], pols,
  };
}

// ---------------------------------------------------------------- regions.json + regions.geojson
export interface PairedStats { pixels: number; medianDifferenceDb: number; meanDifferenceDb: number; p05DifferenceDb: number; p95DifferenceDb: number }
export interface RegionPolStats { beforeMedianDb: number; afterMedianDb: number; paired: PairedStats }
export interface Region {
  id: string; title: string; selectionMethod: string;
  rowRange: Pair<number>; columnRange: Pair<number>;
  stats: Record<Pol, RegionPolStats>;
  observation: string; interpretation: string;
  /** Closed lon/lat ring from regions.geojson. */
  ring: LonLat[];
}
export interface RegionSet {
  study: string; dates: Pair<string>; crs: string; nativeShape: Pair<number>; pixelSpacingMeters: Pair<number>;
  firstPixelCenter: Pair<number>; pairedPixels: number; differenceDefinition: string;
  limitsDb: Pair<number>; scientificStatus: string; regions: Region[];
}

export function parseRegions(meta: unknown, geo: unknown, study: StudyConfig): RegionSet {
  if (!isRec(meta) || !Array.isArray(meta.regions) || !isRec(geo) || !Array.isArray(geo.features)) throw new Error("Region files are malformed");
  if (meta.scientificStatus !== QA_LABEL) throw new Error("Region file is not labelled exploratory");
  const dates = meta.dates, granules = meta.sourceGranules;
  if (!Array.isArray(dates) || dates.join() !== study.dates.join() || !Array.isArray(granules) || granules.join() !== study.granules.join()) throw new Error("Region dates do not match study");
  const crs = str(meta.crs, "crs");
  if (crs !== `EPSG:326${study.utmZone}`) throw new Error("Unexpected region CRS");
  const pair = (v: unknown, what: string): Pair<number> => {
    if (!Array.isArray(v) || v.length !== 2) throw new Error(`Invalid ${what}`);
    return [num(v[0], what), num(v[1], what)];
  };
  const features: unknown[] = geo.features;
  const scale = isRec(meta.visualizationScale) ? pair(meta.visualizationScale.limitsDb, "limitsDb") : ([-6, 6] as Pair<number>);
  const annotations = Array.isArray(meta.annotations) ? meta.annotations.filter(isRec) : [];
  const regions = meta.regions.map((r): Region => {
    if (!isRec(r) || !isRec(r.stats)) throw new Error("Invalid region");
    const id = str(r.id, "region id");
    if (!/^[A-Z]$/.test(id)) throw new Error("Invalid region id");
    if (r.environmentalConclusion !== null && r.environmentalConclusion !== undefined) throw new Error("Region carries an environmental conclusion; refusing to display");
    if (r.scientificStatus !== QA_LABEL) throw new Error("Region is not labelled exploratory");
    const feature = features.find((f) => isRec(f) && isRec(f.properties) && f.properties.id === id);
    const ring = isRec(feature) && isRec(feature.geometry) && feature.geometry.type === "Polygon" && Array.isArray(feature.geometry.coordinates)
      ? (feature.geometry.coordinates[0] as unknown[]) : null;
    if (!ring || ring.length < 4) throw new Error(`Region ${id} has no polygon`);
    const stats = {} as Record<Pol, RegionPolStats>;
    for (const pol of POLS) {
      const s = r.stats[pol];
      if (!isRec(s) || !isRec(s.pairedDifference)) throw new Error(`Region ${id} lacks ${pol} statistics`);
      const d = s.pairedDifference;
      const paired: PairedStats = { pixels: num(d.pixels, "pixels"), medianDifferenceDb: num(d.medianDifferenceDb, "median"), meanDifferenceDb: num(d.meanDifferenceDb, "mean"), p05DifferenceDb: num(d.p05DifferenceDb, "p05"), p95DifferenceDb: num(d.p95DifferenceDb, "p95") };
      if (!(paired.pixels > 0) || !(paired.p05DifferenceDb <= paired.medianDifferenceDb && paired.medianDifferenceDb <= paired.p95DifferenceDb)) throw new Error(`Region ${id} ${pol} statistics are inconsistent`);
      stats[pol] = { beforeMedianDb: num(s.beforeMedianDb, "before"), afterMedianDb: num(s.afterMedianDb, "after"), paired };
    }
    const note = annotations.find((a) => a.id === id);
    return {
      id, title: str(r.title, "title"), selectionMethod: str(r.selectionMethod, "selectionMethod"),
      rowRange: pair(r.rowRange, "rowRange"), columnRange: pair(r.columnRange, "columnRange"), stats,
      observation: note ? str(note.observation, "observation") : "", interpretation: note ? str(note.interpretation, "interpretation") : "",
      ring: ring.map((p): LonLat => {
        if (!Array.isArray(p)) throw new Error("Invalid polygon vertex");
        const lon = num(p[0], "lon"), lat = num(p[1], "lat");
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error("Polygon vertex out of range");
        return [lon, lat];
      }),
    };
  });
  if (!regions.length) throw new Error("No regions");
  return {
    study: str(meta.study, "study"), dates: [study.dates[0], study.dates[1]], crs, nativeShape: pair(meta.nativeShape, "nativeShape"),
    pixelSpacingMeters: pair(meta.pixelSpacingMeters, "pixelSpacingMeters"), firstPixelCenter: pair(meta.firstPixelCenter, "firstPixelCenter"),
    pairedPixels: num(meta.pairedHHAndHVPixels, "pairedPixels"), differenceDefinition: str(meta.differenceDefinition, "differenceDefinition"),
    limitsDb: scale, scientificStatus: QA_LABEL, regions,
  };
}

// ---------------------------------------------------------------- preview manifest (single-date HH/HV PNGs)
export interface PreviewImage { filename: string; displayRangeDb: Pair<number>; screenedPixels: number; sha256: string }
export interface PreviewSet {
  bounds: Bounds; measurement: string; scientificClearance: string; sourceCollection: string;
  acquisitions: Pair<{ date: string; conceptId: string; track: number; frame: number; images: Record<Pol, PreviewImage> }>;
}

export function parsePreview(value: unknown, study: StudyConfig): PreviewSet {
  if (!isRec(value) || !Array.isArray(value.bounds) || value.bounds.length !== 4 || !Array.isArray(value.acquisitions) || value.acquisitions.length !== 2) throw new Error("Preview manifest is malformed");
  const b = value.bounds.map((v) => num(v, "bounds"));
  const [w, s, e, n] = b;
  if (!(w >= -180 && e <= 180 && s >= -85 && n <= 85 && w < e && s < n)) throw new Error("Invalid preview extent");
  const acq = value.acquisitions.map((a, i) => {
    if (!isRec(a) || !isRec(a.images)) throw new Error("Invalid acquisition");
    if (a.date !== study.dates[i] || a.conceptId !== study.granules[i]) throw new Error("Preview acquisition does not match study");
    const images = {} as Record<Pol, PreviewImage>;
    for (const pol of POLS) {
      const im = a.images[pol];
      if (!isRec(im) || im.filename !== `${study.dates[i].replaceAll("-", "")}_${pol}.png` || !Array.isArray(im.displayRangeDb) || im.displayRangeDb.length !== 2) throw new Error("Invalid preview image reference");
      images[pol] = { filename: im.filename, displayRangeDb: [num(im.displayRangeDb[0], "range"), num(im.displayRangeDb[1], "range")], screenedPixels: num(im.screenedPixels, "screenedPixels"), sha256: str(im.sha256, "sha256") };
    }
    return { date: a.date as string, conceptId: a.conceptId as string, track: num(a.track, "track"), frame: num(a.frame, "frame"), images };
  });
  return {
    bounds: [w, s, e, n], measurement: str(value.measurement, "measurement"), scientificClearance: str(value.scientificClearance, "scientificClearance"),
    sourceCollection: str(value.sourceCollection, "sourceCollection"), acquisitions: [acq[0], acq[1]],
  };
}

// ---------------------------------------------------------------- geometry
/** Inverse UTM (northern hemisphere, WGS84) via the Krüger series; accurate to well under a metre. */
export function utmToLonLat(easting: number, northing: number, zone: number): LonLat {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
  const beta = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
  const delta = [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45, 56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
  const xi0 = northing / (k0 * A), eta0 = (easting - 500000) / (k0 * A);
  let xi = xi0, eta = eta0;
  beta.forEach((bj, i) => {
    const j = 2 * (i + 1);
    xi -= bj * Math.sin(j * xi0) * Math.cosh(j * eta0);
    eta -= bj * Math.cos(j * xi0) * Math.sinh(j * eta0);
  });
  const chi = Math.asin(Math.sin(xi) / Math.cosh(eta));
  let lat = chi;
  delta.forEach((dj, i) => { lat += dj * Math.sin(2 * (i + 1) * chi); });
  const lon = (zone - 1) * 6 - 180 + 3 + Math.atan2(Math.sinh(eta), Math.cos(xi)) * 180 / Math.PI;
  return [lon, lat * 180 / Math.PI];
}

/**
 * Corners (top-left, top-right, bottom-right, bottom-left) of the native 10 m raster used by the
 * exploratory difference PNGs, as lon/lat. MapLibre's image source accepts exactly this quadrilateral,
 * so the UTM grid's slight rotation is respected and nothing is resampled.
 */
export function rasterCorners(set: RegionSet, zone: number): [LonLat, LonLat, LonLat, LonLat] {
  const [rows, cols] = set.nativeShape;
  const [dx, dy] = set.pixelSpacingMeters; // dx > 0 eastward, dy < 0 southward as rows increase
  const left = set.firstPixelCenter[0] - dx / 2, top = set.firstPixelCenter[1] - dy / 2;
  const at = (c: number, r: number) => utmToLonLat(left + c * dx, top + r * dy, zone);
  return [at(0, 0), at(cols, 0), at(cols, rows), at(0, rows)];
}

export function ringBounds(ring: readonly LonLat[]): Bounds {
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}
export function cornersBounds(c: readonly LonLat[]): Bounds { return ringBounds(c); }
export function padBounds([w, s, e, n]: Bounds, fraction: number): Bounds {
  const dx = (e - w) * fraction, dy = (n - s) * fraction;
  return [w - dx, s - dy, e + dx, n + dy];
}

// ---------------------------------------------------------------- wording
export const fmtDb = (v: number, digits = 2) => `${v.toFixed(digits).replace("-", "−")} dB`;
export const fmtSignedDb = (v: number, digits = 2) => {
  const s = Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : v.toFixed(digits);
  return `${s.startsWith("-") ? "−" + s.slice(1) : "+" + s.replace(/^\+/, "")} dB`;
};
export const fmtDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const fmtInt = (v: number) => v.toLocaleString("en-US");

function direction(v: number, digits: number): string {
  if (Math.abs(v) < 0.5 * 10 ** -digits) return "essentially unchanged";
  return v > 0 ? "slightly higher" : "slightly lower";
}

/** Shared area under the two normalised histograms: 1 = identical distributions, 0 = no overlap. Descriptive only. */
export function histogramOverlap(ev: PolEvidence): number {
  return histogramShares(ev).reduce((sum, b) => sum + Math.min(b.shares[0], b.shares[1]), 0);
}

/** Plain-language reading of a whole-study summary. Numbers only; no cause is asserted. */
export function describeStudyShift(pol: Pol, ev: PolEvidence, dates: Pair<string>): string {
  const [b, a] = ev.observations;
  const d = ev.differenceOfRegionalMediansDb;
  return `Across all ${fmtInt(b.count)} screened pixels, the ${pol} median backscatter was ${fmtDb(b.medianDb)} on ${fmtDate(dates[0])} and ${fmtDb(a.medianDb)} on ${fmtDate(dates[1])}: ${direction(d, 2)} on the later date (${fmtSignedDb(d)}). The two histograms share ${Math.round(histogramOverlap(ev) * 100)}% of their area (100% would mean identical distributions). This compares two separate regional summaries; it is not a measurement of change at any pixel.`;
}

/** Plain-language reading of one investigation region. Numbers only; no cause is asserted. */
export function describeRegion(pol: Pol, r: Region, dates: Pair<string>): string {
  const s = r.stats[pol], p = s.paired;
  const spread = p.p95DifferenceDb - p.p05DifferenceDb;
  const small = spread > 0 && Math.abs(p.medianDifferenceDb) < 0.25 * spread;
  const head = `In this ${fmtInt(p.pixels)}-pixel window (about 800 m × 800 m) the typical ${pol} pixel was ${direction(p.medianDifferenceDb, 2)} on ${fmtDate(dates[1])} than on ${fmtDate(dates[0])}: the median of the per-pixel differences is ${fmtSignedDb(p.medianDifferenceDb, 3)}.`;
  const tail = ` Individual pixels vary far more than that: the middle 90% of pixel differences run from ${fmtSignedDb(p.p05DifferenceDb, 1)} to ${fmtSignedDb(p.p95DifferenceDb, 1)}${small ? ", so the typical shift is small compared with pixel-to-pixel variation" : ""}.`;
  return head + tail;
}

/** Bar heights for the SVG histogram, normalised to a share of retained pixels so dates with different masks stay comparable. */
export function histogramShares(ev: PolEvidence): { low: number; high: number; shares: Pair<number> }[] {
  const totals: [number, number] = [0, 1].map((i) => ev.bins.reduce((s, b) => s + b.counts[i], 0)) as [number, number];
  return ev.bins.map((b) => ({ low: b.lowDb, high: b.highDb, shares: [b.counts[0] / totals[0], b.counts[1] / totals[1]] as Pair<number> }));
}
