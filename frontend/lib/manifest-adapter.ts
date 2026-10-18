import type {
  Acquisition,
  DashboardDataset,
  GeographicBounds,
  HistogramDistribution,
  Hotspot,
  Metric,
  Phenomenon,
  Polarization,
} from "./sample-schema";

type ObjectValue = Record<string, unknown>;
const polNames: Polarization[] = ["HH", "HV"];
const fail = (path: string, detail: string): never => {
  throw new Error(`Invalid pipeline manifest at ${path}: ${detail}.`);
};
const object = (value: unknown, path: string): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : fail(path, "expected an object");
const string = (value: unknown, path: string): string =>
  typeof value === "string" && value.trim()
    ? value
    : fail(path, "expected a nonempty string");
const number = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : fail(path, "expected a finite number");
const integer = (value: unknown, path: string): number => {
  const n = number(value, path);
  return Number.isInteger(n) && n >= 0
    ? n
    : fail(path, "expected a nonnegative integer");
};
const array = (value: unknown, path: string): unknown[] =>
  Array.isArray(value) ? value : fail(path, "expected an array");
const date = (value: unknown, path: string): string => {
  const s = string(value, path),
    [year, month, day] = s.slice(0, 10).split("-").map(Number),
    calendar = new Date(Date.UTC(year, month - 1, day));
  return /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    calendar.getUTCFullYear() === year &&
    calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day
    ? s
    : fail(path, "expected a valid ISO date or timestamp with timezone");
};
const range = (value: unknown, path: string): [number, number] => {
  const a = array(value, path);
  if (a.length !== 2) fail(path, "expected two limits");
  const lo = number(a[0], path),
    hi = number(a[1], path);
  return lo < hi ? [lo, hi] : fail(path, "limits must increase");
};
const bounds = (value: unknown, path: string): GeographicBounds => {
  const a = array(value, path).map((n) => number(n, path));
  if (
    a.length !== 4 ||
    a[0] < -180 ||
    a[2] > 180 ||
    a[1] < -85.06 ||
    a[3] > 85.06 ||
    a[0] >= a[2] ||
    a[1] >= a[3]
  )
    fail(
      path,
      "expected non-crossing Web Mercator-compatible [west, south, east, north] bounds",
    );
  return a as GeographicBounds;
};

/** Pipeline paths are local assets, never remote resources or traversals. */
export function pipelineAssetUrl(
  value: unknown,
  path = "url",
  extension = "png",
): string {
  const s = string(value, path);
  if (
    !/^[A-Za-z0-9_.\-/]+$/.test(s) ||
    s.startsWith("/") ||
    s.split("/").some((part) => !part || part === "." || part === "..") ||
    !s.toLowerCase().endsWith(`.${extension}`)
  )
    fail(path, `expected a safe relative .${extension} asset path`);
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/${s}`;
}

/** The committed empty sentinel describes the shipped sample mode only. */
export function isSampleManifestSentinel(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sentinel = value as ObjectValue;
  return (
    Object.keys(sentinel).length === 3 &&
    sentinel.schemaVersion === "1.0" &&
    sentinel.provenance === "sample" &&
    Array.isArray(sentinel.frames) &&
    sentinel.frames.length === 0
  );
}

function histogram(
  value: unknown,
  path: string,
): HistogramDistribution & { validPixels: number } {
  const h = object(value, path),
    edges = array(h.binEdges, `${path}.binEdges`).map((n) => number(n, path)),
    counts = array(h.counts, `${path}.counts`).map((n) => integer(n, path));
  if (
    counts.length !== 64 ||
    edges.length !== 65 ||
    edges.some((n, i) => i > 0 && n <= edges[i - 1]) ||
    edges.some(
      (n, i) =>
        Math.abs(n - (edges[0] + ((edges[64] - edges[0]) * i) / 64)) > 0.00001,
    )
  )
    fail(path, "expected 64 uniform bins and 65 increasing edges");
  const sum = counts.reduce((a, b) => a + b, 0),
    validPixels =
      h.validPixels === undefined
        ? sum
        : integer(h.validPixels, `${path}.validPixels`);
  if (validPixels < sum)
    fail(path, "validPixels is smaller than in-range counts");
  const normalized =
    h.normalized === undefined
      ? counts.map((n) => (validPixels ? n / validPixels : 0))
      : array(h.normalized, `${path}.normalized`).map((n) => number(n, path));
  if (
    normalized.length !== 64 ||
    normalized.some(
      (n, i) =>
        n < 0 ||
        n > 1 ||
        Math.abs(n - (validPixels ? counts[i] / validPixels : 0)) > 0.00001,
    )
  )
    fail(path, "normalized values must be fractions of valid pixels");
  return { binEdges: edges, counts, normalized, validPixels };
}

function meanMetric(
  pol: Polarization,
  distribution: HistogramDistribution,
  statistics: unknown,
): Metric {
  const count = distribution.counts.reduce((a, b) => a + b, 0);
  const approximateMean = count
    ? distribution.counts.reduce(
        (sum, n, i) =>
          sum +
          (n * (distribution.binEdges[i] + distribution.binEdges[i + 1])) / 2,
        0,
      ) / count
    : null;
  let value = approximateMean;
  let note =
    "Approximate mean of in-range pixels from histogram bin centers; values outside the display range are excluded.";
  if (statistics !== undefined) {
    const stats = object(statistics, `statisticsDb.${pol}`);
    value =
      stats.mean === null
        ? null
        : number(stats.mean, `statisticsDb.${pol}.mean`);
    note =
      "Mean of the valid reduced-resolution dB raster; linear power was averaged before conversion to dB. This is a signal statistic, not a land-loss estimate.";
  }
  return {
    id: `mean-${pol}`,
    label: `${pol} mean backscatter`,
    value,
    unit: "dB",
    area: null,
    provenance: "derived",
    status: "NOMINAL",
    note,
  };
}

/** Adapt the offline pipeline contract without mixing scientific and sample provenance. */
export function adaptPipelineManifest(value: unknown): {
  phenomenon: Phenomenon;
  generated: string;
  source: string;
  notes: string[];
} {
  const m = object(value, "root");
  if (m.provenance !== "derived") fail("provenance", "expected derived");
  const generated = date(m.generated, "generated"),
    source = string(m.source, "source"),
    dbRangesObject = object(m.dbRanges, "dbRanges"),
    dbRanges: Partial<Record<Polarization, [number, number]>> = {};
  for (const pol of polNames)
    if (dbRangesObject[pol] !== undefined)
      dbRanges[pol] = range(dbRangesObject[pol], `dbRanges.${pol}`);
  const frames = array(m.frames, "frames");
  if (!frames.length) fail("frames", "no processed frames");
  const notes =
    m.processingNotes === undefined
      ? []
      : array(m.processingNotes, "processingNotes").map((n) =>
          string(n, "processingNotes"),
        );
  const colorMapsObject =
    m.colorMaps === undefined ? {} : object(m.colorMaps, "colorMaps");
  if (
    colorMapsObject.backscatter !== undefined &&
    colorMapsObject.backscatter !== "gray" &&
    colorMapsObject.backscatter !== "viridis"
  )
    fail("colorMaps.backscatter", "unsupported color map");
  if (
    colorMapsObject.change !== undefined &&
    colorMapsObject.change !== "RdBu_r" &&
    colorMapsObject.change !== "coolwarm"
  )
    fail("colorMaps.change", "unsupported color map");
  const colorMaps = {
    backscatter:
      colorMapsObject.backscatter === "viridis"
        ? ("viridis" as const)
        : ("gray" as const),
    change:
      colorMapsObject.change === "coolwarm"
        ? ("coolwarm" as const)
        : ("RdBu_r" as const),
  };
  const changeRangeDb =
    m.changeRangeDb === undefined
      ? ([-6, 6] as [number, number])
      : range(m.changeRangeDb, "changeRangeDb");
  if (
    changeRangeDb[0] >= 0 ||
    Math.abs(changeRangeDb[0] + changeRangeDb[1]) > 0.00001
  )
    fail("changeRangeDb", "expected symmetric limits centered at zero");
  const ids = new Set<string>();
  const locations: Hotspot[] = frames.map((entry, fi) => {
    const f = object(entry, `frames[${fi}]`),
      id = string(f.id, "frame.id"),
      track = integer(f.track, "frame.track"),
      frame = integer(f.frame, "frame.frame"),
      geographicBounds = bounds(f.bounds, "frame.bounds");
    if (ids.has(id)) fail("frame.id", "duplicate frame id");
    ids.add(id);
    if (f.crs !== "EPSG:4326") fail("frame.crs", "expected EPSG:4326 bounds");
    if (f.passDirection !== "ASCENDING" && f.passDirection !== "DESCENDING")
      fail("frame.passDirection", "expected ASCENDING or DESCENDING");
    const direction = f.passDirection as "ASCENDING" | "DESCENDING";
    const acquisitions: Acquisition[] = array(
      f.acquisitions,
      "frame.acquisitions",
    )
      .map((entry, ai): Acquisition => {
        const a = object(entry, `acquisitions[${ai}]`),
          acquisitionDate = date(a.date, "acquisition.date"),
          pols = array(a.pols, "acquisition.pols").map((p) =>
            string(p, "acquisition.pols"),
          );
        if (
          !pols.length ||
          pols.some((p) => !polNames.includes(p as Polarization)) ||
          new Set(pols).size !== pols.length
        )
          fail("acquisition.pols", "expected unique HH/HV polarizations");
        const polarization = pols as Polarization[],
          overlays = object(a.overlays, "acquisition.overlays"),
          histograms = object(a.histogramDb, "acquisition.histogramDb"),
          statistics =
            a.statisticsDb === undefined
              ? {}
              : object(a.statisticsDb, "acquisition.statisticsDb"),
          cog = a.cog === undefined ? {} : object(a.cog, "acquisition.cog"),
          grids = a.roiGrid === undefined ? {} : object(a.roiGrid, "acquisition.roiGrid");
        const histogramDb: Partial<
            Record<Polarization, HistogramDistribution>
          > = {},
          cogUrls: Partial<Record<Polarization, string>> = {},
          roiGridUrls: Partial<Record<Polarization, string>> = {},
          layerUrls = {
            HH: null as string | null,
            HV: null as string | null,
            displacement: null,
          },
          metrics: Metric[] = [];
        for (const pol of polarization) {
          if (!dbRanges[pol]) fail(`dbRanges.${pol}`, "missing display range");
          layerUrls[pol] = pipelineAssetUrl(overlays[pol], `overlays.${pol}`);
          const h = histogram(histograms[pol], `histogramDb.${pol}`);
          const r = dbRanges[pol]!;
          if (
            Math.abs(h.binEdges[0] - r[0]) > 0.00001 ||
            Math.abs(h.binEdges[64] - r[1]) > 0.00001
          )
            fail(`histogramDb.${pol}`, "edges differ from fixed display range");
          histogramDb[pol] = h;
          metrics.push(meanMetric(pol, h, statistics[pol]));
          metrics.push({
            id: `pixels-${pol}`,
            label: `${pol} valid raster pixels`,
            value: h.validPixels,
            unit: "px",
            area: null,
            provenance: "derived",
            status: "NOMINAL",
            note: "Valid pixels in the reduced raster, including values outside the histogram display range.",
          });
          if (cog[pol] !== undefined)
            cogUrls[pol] = pipelineAssetUrl(cog[pol], `cog.${pol}`, "tif");
          if (grids[pol] !== undefined)
            roiGridUrls[pol] = pipelineAssetUrl(grids[pol], `roiGrid.${pol}`, "json");
        }
        return {
          date: acquisitionDate,
          referenceDate: acquisitionDate,
          provenance: "derived",
          source,
          dbRanges,
          histogramDb,
          cogUrls,
          roiGridUrls,
          optical: a.optical===undefined?undefined:(()=>{
            const o=object(a.optical,"acquisition.optical");
            const path=string(o.url,"optical.url");
            const extension=path.toLowerCase().split(".").at(-1);
            if(!extension||!["png","jpg","webp"].includes(extension))fail("optical.url","expected local png, jpg or webp");
            return {url:pipelineAssetUrl(path,"optical.url",extension),
              date:date(o.date,"optical.date"),
              source:string(o.source,"optical.source"),
              credit:string(o.credit,"optical.credit")};
          })(),
          backscatterNormalization: "gamma0",
          histogramOrdinateUnit: "%",
          areaUnit: "km²",
          displacementSign: "positive_toward_sensor",
          productType: "GCOV",
          polarization,
          orbit: integer(a.orbit, "acquisition.orbit"),
          frame,
          passDirection: direction,
          productVersion: string(
            a.productVersion,
            "acquisition.productVersion",
          ),
          compositeReleaseId:
            a.compositeReleaseId === undefined
              ? "UNKNOWN"
              : string(a.compositeReleaseId, "acquisition.compositeReleaseId"),
          dataMaturity:
            a.dataMaturity === undefined
              ? "UNKNOWN"
              : string(a.dataMaturity, "acquisition.dataMaturity"),
          histogramBinsDb: [],
          displacementProfileCm: [],
          metrics,
          insight:
            "Backscatter measures radar brightness. A difference can reflect surface water, vegetation, moisture, or geometry; it does not establish a cause or a land-loss area.",
          layerUrls,
          tileUrl: null,
        };
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!acquisitions.length) fail("frame.acquisitions", "no acquisitions");
    if (new Set(acquisitions.map((a) => a.date)).size !== acquisitions.length)
      fail("acquisition.date", "duplicate acquisition dates");
    if (
      new Set(acquisitions.map((a) => a.productVersion)).size > 1 &&
      f.mixedVersions !== true
    )
      fail(
        "frame.productVersion",
        "mixed processing versions require an explicit mixedVersions flag",
      );
    const knownDates = new Set(acquisitions.map((a) => a.date));
    const changeLayers =
      f.changeLayers === undefined
        ? []
        : array(f.changeLayers, "frame.changeLayers").map((entry) => {
            const c = object(entry, "changeLayer"),
              from = date(c.from, "changeLayer.from"),
              to = date(c.to, "changeLayer.to");
            if (
              !knownDates.has(from) ||
              !knownDates.has(to) ||
              Date.parse(from) > Date.parse(to)
            )
              fail(
                "changeLayer",
                "dates must reference ordered acquisitions in this frame",
              );
            if (c.type !== "dbDiff" && c.type !== "hvhhDiff")
              fail("changeLayer.type", "unsupported change type");
            if (
              c.type === "dbDiff" &&
              !polNames.includes(c.pol as Polarization)
            )
              fail("changeLayer.pol", "dbDiff requires HH or HV");
            return {
              from,
              to,
              type: c.type as "dbDiff" | "hvhhDiff",
              pol: c.pol as Polarization | undefined,
              url: pipelineAssetUrl(c.url, "changeLayer.url"),
            };
          });
    const frameNotes = [
      ...notes,
      ...(f.mixedVersions === true
        ? [
            "WARN: mixed processing versions were explicitly allowed for this frame. Comparisons need additional quality review.",
          ]
        : []),
    ];
    return {
      id: `gcov-${id}`,
      label:
        f.label === undefined
          ? `Track ${track} · Frame ${frame}`
          : string(f.label, "frame.label"),
      region: `Track ${track} / frame ${frame} · ${direction.toLowerCase()}`,
      aliases: [id, `track ${track}`, `frame ${frame}`, "GCOV", "processed"],
      provenance: "derived",
      bounds: geographicBounds,
      track,
      changeLayers,
      changeRangeDb,
      colorMaps,
      processingNotes: frameNotes,
      coordinates: {
        longitude: (geographicBounds[0] + geographicBounds[2]) / 2,
        latitude: (geographicBounds[1] + geographicBounds[3]) / 2,
      },
      coordinateSource: source,
      coordinateMethod: "bounds_midpoint",
      areaKm2: null,
      textureSeed: 0,
      acquisitions,
      events: [],
    };
  });
  return {
    generated,
    source,
    notes,
    phenomenon: {
      id: "gcov",
      label: "Processed GCOV",
      shortLabel: "GCOV",
      description: "Derived radar backscatter · local files",
      analysis: "backscatter",
      explanation:
        "These static overlays come from locally processed NISAR GCOV linear-power products. Darker and brighter pixels show lower and higher gamma-0 radar backscatter within a fixed dB display range. The swipe compares actual acquisition rasters; the change layer uses later minus earlier dB.",
      limitation:
        "GCOV brightness changes do not prove wetland loss, deforestation, or earthquake displacement. This raster preview has geographic bounds but no map engine or basemap. Masked pixels remain transparent; histograms include only the displayed dB range and report frequency relative to all valid pixels.",
      locations,
    },
  };
}

export function withPipelineFrames(
  sample: DashboardDataset,
  manifest: ReturnType<typeof adaptPipelineManifest>,
): DashboardDataset {
  return {
    ...sample,
    provenance: "mixed",
    notes: [...sample.notes, ...manifest.notes],
    phenomena: [manifest.phenomenon, ...sample.phenomena],
  };
}
