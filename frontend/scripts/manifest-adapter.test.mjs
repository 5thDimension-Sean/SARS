import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Test the exact pure adapter used by the UI; its sole import is type-only.
const source = await readFile(
  new URL("../lib/manifest-adapter.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const {
  adaptPipelineManifest,
  isSampleManifestSentinel,
  pipelineAssetUrl,
  withPipelineFrames,
} = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
test("pipeline assets use the deployment base path for GitHub Pages", () => {
  const previous = process.env.NEXT_PUBLIC_BASE_PATH;
  try {
    process.env.NEXT_PUBLIC_BASE_PATH = "/SARS";
    assert.equal(pipelineAssetUrl("T001_F002/1_HV.png"), "/SARS/data/T001_F002/1_HV.png");
    assert.equal(pipelineAssetUrl("T001_F002/1_HH.tif", "cog", "tif"), "/SARS/data/T001_F002/1_HH.tif");
    assert.throws(() => pipelineAssetUrl("../outside.png"), /safe relative/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = previous;
  }
});

test("only the exact empty sample sentinel bypasses scientific validation", () => {
  assert.equal(
    isSampleManifestSentinel({
      schemaVersion: "1.0",
      provenance: "sample",
      frames: [],
    }),
    true,
  );
  for (const input of [
    null,
    [],
    { schemaVersion: "1.0", provenance: "derived", frames: [] },
    { schemaVersion: "1.0", provenance: "sample", frames: [{}] },
    { schemaVersion: "1.0", provenance: "sample", frames: [], overlays: {} },
    { schemaVersion: "2.0", provenance: "sample", frames: [] },
  ])
    assert.equal(isSampleManifestSentinel(input), false);
});
function manifest() {
  const histogram = (low, high) => ({
    binEdges: Array.from(
      { length: 65 },
      (_, i) => low + ((high - low) * i) / 64,
    ),
    counts: Array(64).fill(1),
    normalized: Array(64).fill(1 / 64),
    validPixels: 64,
  });
  return {
    generated: "2026-10-03T12:00:00Z",
    provenance: "derived",
    source: "Synthetic contract test only",
    dbRanges: { HH: [-25, 0], HV: [-30, -5] },
    processingNotes: ["Synthetic fixture, not a NASA observation."],
    colorMaps: { backscatter: "gray", change: "RdBu_r" },
    changeRangeDb: [-6, 6],
    frames: [
      {
        id: "T001_F002",
        label: "Test frame",
        track: 1,
        frame: 2,
        passDirection: "ASCENDING",
        crs: "EPSG:4326",
        bounds: [-81, 25, -80, 26],
        acquisitions: ["2026-09-01T10:00:00Z", "2026-09-25T10:00:00Z"].map(
          (date, i) => ({
            date,
            orbit: 100 + i,
            productVersion: "1.0",
            pols: ["HH", "HV"],
            overlays: {
              HH: `T001_F002/${i}_HH.png`,
              HV: `T001_F002/${i}_HV.png`,
            },
            cog: { HH: `T001_F002/${i}_HH.tif` },
            histogramDb: { HH: histogram(-25, 0), HV: histogram(-30, -5) },
            statisticsDb: {
              HH: { mean: -12 + i, min: -25, max: 0, validPixels: 64 },
              HV: { mean: -15 + i, min: -30, max: -5, validPixels: 64 },
            },
          }),
        ),
        changeLayers: [
          {
            from: "2026-09-01T10:00:00Z",
            to: "2026-09-25T10:00:00Z",
            type: "dbDiff",
            pol: "HV",
            url: "T001_F002/change_HV.png",
          },
        ],
        gaps: [
          {
            from: "2026-09-01T10:00:00Z",
            to: "2026-09-25T10:00:00Z",
            days: 24,
          },
        ],
      },
    ],
  };
}
test("processed frames preserve source, statistics, ranges, dates, safe URLs and derived provenance", () => {
  const result = adaptPipelineManifest(manifest()),
    location = result.phenomenon.locations[0],
    acquisition = location.acquisitions[1];
  assert.equal(result.phenomenon.id, "gcov");
  assert.equal(location.provenance, "derived");
  assert.deepEqual(location.coordinates, { latitude: 25.5, longitude: -80.5 });
  assert.equal(acquisition.date, "2026-09-25T10:00:00Z");
  assert.equal(acquisition.metrics.find((m) => m.id === "mean-HV").value, -14);
  assert(
    acquisition.metrics.every(
      (m) => m.provenance === "derived" && m.area === null,
    ),
  );
  assert.equal(acquisition.layerUrls.HV, "/data/T001_F002/1_HV.png");
  assert.equal(acquisition.cogUrls.HH, "/data/T001_F002/1_HH.tif");
  assert.equal(
    acquisition.histogramDb.HV.normalized.reduce((a, b) => a + b),
    1,
  );
  assert.equal(location.changeLayers[0].pol, "HV");
  assert.equal(location.areaKm2, null);
  assert.equal(acquisition.compositeReleaseId, "UNKNOWN");
  assert.equal(acquisition.dataMaturity, "UNKNOWN");
});
test("samples remain separate and unchanged when processed frames are added", () => {
  const sample = {
    schemaVersion: "1",
    provenance: "sample",
    nominalRepeatDays: 12,
    notes: [],
    phenomena: [{ id: "earthquake", locations: [{ id: "sample-quake" }] }],
  };
  const combined = withPipelineFrames(
    sample,
    adaptPipelineManifest(manifest()),
  );
  assert.equal(combined.provenance, "mixed");
  assert.equal(combined.phenomena[1], sample.phenomena[0]);
  assert.equal(sample.phenomena.length, 1);
});
test("histogram approximation is labeled, missing pixels remain unavailable, and outside-range values are respected", () => {
  const input = manifest();
  const a = input.frames[0].acquisitions[0];
  delete a.statisticsDb;
  a.histogramDb.HV.validPixels = 128;
  a.histogramDb.HV.normalized = Array(64).fill(1 / 128);
  let result =
    adaptPipelineManifest(input).phenomenon.locations[0].acquisitions[0];
  const metric = result.metrics.find((m) => m.id === "mean-HV");
  assert.equal(metric.value, -17.5);
  assert.match(metric.note, /Approximate.*outside/);
  assert.equal(
    result.histogramDb.HV.normalized.reduce((a, b) => a + b),
    0.5,
  );
  a.histogramDb.HV.counts = Array(64).fill(0);
  a.histogramDb.HV.normalized = Array(64).fill(0);
  a.histogramDb.HV.validPixels = 0;
  result = adaptPipelineManifest(input).phenomenon.locations[0].acquisitions[0];
  assert.equal(result.metrics.find((m) => m.id === "mean-HV").value, null);
});
test("reject corrupt scientific data and incompatible manifests with readable errors", () => {
  for (const mutate of [
    (m) => (m.provenance = "sample"),
    (m) => (m.frames = []),
    (m) => (m.frames[0].bounds[0] = NaN),
    (m) => (m.frames[0].bounds = [175, 25, -175, 26]),
    (m) => (m.frames[0].acquisitions[0].orbit = Infinity),
    (m) => m.frames[0].acquisitions[0].histogramDb.HV.counts.pop(),
    (m) => (m.frames[0].acquisitions[0].histogramDb.HV.normalized[0] = -1),
    (m) => (m.frames[0].acquisitions[0].histogramDb.HV.binEdges[0] = -50),
    (m) => (m.frames[0].acquisitions[0].date = "garbage"),
    (m) => (m.frames[0].acquisitions[0].date = "2026-02-30"),
    (m) => (m.frames[0].acquisitions[0].histogramDb.HV.binEdges[8] += 0.1),
    (m) => (m.frames[0].acquisitions[0].productVersion = "2.0"),
    (m) => (m.changeRangeDb = [-6, 3]),
    (m) => (m.colorMaps.backscatter = "jet"),
    (m) => (m.frames[0].acquisitions[0].pols = ["VV"]),
    (m) => (m.frames[0].changeLayers[0].from = "2020-01-01"),
    (m) => delete m.frames[0].changeLayers[0].pol,
  ]) {
    const input = manifest();
    mutate(input);
    assert.throws(
      () => adaptPipelineManifest(input),
      /Invalid pipeline manifest/,
    );
  }
});
test("reject remote, absolute, encoded and traversal asset paths", () => {
  for (const path of [
    "../secret.png",
    "a/../secret.png",
    "/file.png",
    "https://example.com/a.png",
    "C:/temp/a.png",
    "a\\b.png",
    "%2e%2e/file.png",
    "a.png?x=1",
    "a//b.png",
    "file.svg",
  ])
    assert.throws(() => pipelineAssetUrl(path), /safe relative/);
});
test("sort acquisitions and flag explicitly allowed mixed versions", () => {
  const input = manifest();
  input.frames[0].acquisitions.reverse();
  input.frames[0].mixedVersions = true;
  const location = adaptPipelineManifest(input).phenomenon.locations[0];
  assert.equal(location.acquisitions[0].date, "2026-09-01T10:00:00Z");
  assert(
    location.processingNotes.some((n) =>
      n.includes("WARN: mixed processing versions"),
    ),
  );
});
