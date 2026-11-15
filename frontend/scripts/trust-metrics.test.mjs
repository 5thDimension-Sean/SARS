import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGridMeta, decodeGrid, boxProblem, analyzeBox, boxAreaKm2, buildReadiness, alternativeExplanations,
  buildTrustReport, escapeHtml, reportFilename, statusFromText, signedDb, expectedChanceHits, countSelectionCandidates,
  BACKGROUND_RATE_THRESHOLD,
} from "../lib/trust-metrics.ts";

// Synthetic fixtures only. Nothing here is NASA data and nothing is shown in the app.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function gaussian(random) { return Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random()); }
function noiseGrid(rows, cols, seed = 7, sigma = 2) {
  const r = rng(seed), data = new Float32Array(rows * cols);
  for (let i = 0; i < data.length; i++) data[i] = sigma * gaussian(r);
  return { rows, cols, data };
}
function plant(grid, box, shift) {
  for (let r = box.r0; r < box.r1; r++) for (let c = box.c0; c < box.c1; c++) grid.data[r * grid.cols + c] += shift;
}
const meta = () => ({
  schemaVersion: "sar-waltz-difference-grid-1.0", study: "Synthetic", dates: ["2000-01-01", "2000-01-13"],
  sourceGranules: ["G1-TEST", "G2-TEST"], dtype: "int16", byteOrder: "little", rowOrder: "north-up",
  scaleDb: 0.01, nodata: -32768, shape: [2, 3], pixelSpacingMeters: [10, -10], crs: "EPSG:32615", warning: "EXPLORATORY ONLY",
  files: { HH: "HH_difference_grid.i16", HV: "HV_difference_grid.i16" },
});

test("grid metadata rejects wrong schema, encoding, shape, dates and file names", () => {
  assert.equal(parseGridMeta(meta()).shape[1], 3);
  for (const edit of [
    (m) => { m.schemaVersion = "x"; }, (m) => { m.dtype = "float32"; }, (m) => { m.byteOrder = "big"; },
    (m) => { m.shape = [0, 3]; }, (m) => { m.shape = [9000, 3]; }, (m) => { m.dates = ["2000-01-01", "2000-01-01"]; },
    (m) => { m.sourceGranules = ["bad id<x>", "G2-TEST"]; }, (m) => { m.sourceGranules = ["", "G2-TEST"]; }, (m) => { m.files.HH = "../x.i16"; },
    (m) => { m.nodata = 0; }, (m) => { delete m.warning; }, (m) => { m.pixelSpacingMeters = [0, -10]; }, (m) => { delete m.pixelSpacingMeters; },
  ]) { const m = meta(); edit(m); assert.throws(() => parseGridMeta(m)); }
  assert.throws(() => parseGridMeta(null));
});

test("granule identifiers may be ASF concept IDs or full NISAR scene names, but never markup", () => {
  const m = meta();
  m.sourceGranules = ["NISAR_L2_PR_GCOV_030_162_A_019_4005_DHDH_A_20260917T101351_20260917T101409_P05023_N_P_J_001", "G4361359332-ASF"];
  assert.equal(parseGridMeta(m).sourceGranules.length, 2);
});

test("decoding maps nodata to NaN, applies scale, and rejects wrong byte length", () => {
  const buffer = new ArrayBuffer(12), view = new DataView(buffer);
  [100, -250, -32768, 0, 600, -600].forEach((v, i) => view.setInt16(i * 2, v, true));
  const grid = decodeGrid(buffer, parseGridMeta(meta()));
  assert.equal(grid.data[0], 1); assert.equal(grid.data[1], -2.5); assert.ok(Number.isNaN(grid.data[2]));
  assert.throws(() => decodeGrid(new ArrayBuffer(10), parseGridMeta(meta())), /does not match/);
});

test("box validation rejects fractional, outside, reversed and too-small boxes", () => {
  const g = noiseGrid(100, 100);
  assert.equal(boxProblem(g, { r0: 0, r1: 20, c0: 0, c1: 20 }), null);
  assert.match(boxProblem(g, { r0: 0.5, r1: 20, c0: 0, c1: 20 }), /whole pixel/);
  assert.match(boxProblem(g, { r0: -1, r1: 20, c0: 0, c1: 20 }), /inside/);
  assert.match(boxProblem(g, { r0: 0, r1: 101, c0: 0, c1: 20 }), /inside/);
  assert.match(boxProblem(g, { r0: 20, r1: 20, c0: 0, c1: 30 }), /after its start/);
  assert.match(boxProblem(g, { r0: 0, r1: 10, c0: 0, c1: 10 }), /at least 400/);
  assert.equal(analyzeBox(g, { r0: 0, r1: 10, c0: 0, c1: 10 }).ok, false);
});

test("a planted change stands out; a noise-only box does not", () => {
  const g = noiseGrid(240, 240);
  const planted = { r0: 100, r1: 140, c0: 100, c1: 140 };
  plant(g, planted, 1.5);
  const hit = analyzeBox(g, planted);
  assert.ok(hit.ok);
  assert.ok(hit.excessDb > 1.2 && hit.excessDb < 1.8, `excess ${hit.excessDb}`);
  assert.ok(hit.exceedanceRate <= BACKGROUND_RATE_THRESHOLD, `rate ${hit.exceedanceRate}`);
  assert.ok(hit.referenceWindows >= 30);
  assert.ok(hit.backgroundSpreadDb < 0.6, "background spread should reflect speckle only");
  const quiet = analyzeBox(g, { r0: 10, r1: 50, c0: 10, c1: 50 });
  assert.ok(quiet.ok && quiet.exceedanceRate > BACKGROUND_RATE_THRESHOLD, `rate ${quiet.exceedanceRate}`);
});

test("the rate is never reported as zero, even for an extreme change", () => {
  const g = noiseGrid(240, 240, 11);
  const box = { r0: 60, r1: 100, c0: 60, c1: 100 };
  plant(g, box, 20);
  const r = analyzeBox(g, box);
  assert.ok(r.ok && r.exceedanceRate > 0);
  assert.ok(Math.abs(r.exceedanceRate - 1 / (r.referenceWindows + 1)) < 1e-12);
});

test("a scene-wide shift moves the baseline but does not make a box look unusual", () => {
  const base = noiseGrid(240, 240, 3), shifted = noiseGrid(240, 240, 3);
  for (let i = 0; i < shifted.data.length; i++) shifted.data[i] += 3;
  const box = { r0: 20, r1: 60, c0: 150, c1: 190 };
  const a = analyzeBox(base, box), b = analyzeBox(shifted, box);
  assert.ok(a.ok && b.ok);
  assert.ok(Math.abs(b.sceneShiftDb - a.sceneShiftDb - 3) < 1e-3);
  assert.ok(Math.abs(b.excessDb - a.excessDb) < 1e-3);
  assert.ok(Math.abs(b.exceedanceRate - a.exceedanceRate) < 1e-9);
});

test("masked pixels: too many invalid pixels refuse; scattered invalid pixels are ignored", () => {
  const g = noiseGrid(240, 240, 5), box = { r0: 100, r1: 140, c0: 100, c1: 140 };
  const masked = { ...g, data: g.data.slice() };
  for (let r = 100; r < 140; r++) for (let c = 100; c < 130; c++) masked.data[r * 240 + c] = NaN;
  const refusal = analyzeBox(masked, box);
  assert.equal(refusal.ok, false); assert.match(refusal.reason, /valid paired pixels/);
  const sparse = { ...g, data: g.data.slice() };
  for (let i = 0; i < sparse.data.length; i += 25) sparse.data[i] = NaN;
  const ok = analyzeBox(sparse, box);
  assert.ok(ok.ok && ok.validFraction > 0.9 && ok.pixels < 1600);
});

test("boxes without enough comparable background windows are refused, not guessed", () => {
  const g = noiseGrid(60, 60);
  const r = analyzeBox(g, { r0: 0, r1: 40, c0: 0, c1: 40 });
  assert.equal(r.ok, false); assert.match(r.reason, /comparable background windows/);
});

test("selection candidate count follows the build-script tile size and step", () => {
  assert.equal(countSelectionCandidates(noiseGrid(200, 200)), 4 * 4); // floor((200-80)/40)+1 = 4 per axis
  assert.equal(countSelectionCandidates(noiseGrid(79, 200)), 0);
  assert.equal(countSelectionCandidates(noiseGrid(200, 200), 64, 32), 5 * 5); // floor((200-64)/32)+1 = 5 per axis
});

test("box area uses the grid's own pixel spacing, not an assumed 10 m", () => {
  const box = { r0: 0, r1: 100, c0: 0, c1: 100 };
  assert.equal(boxAreaKm2(box, [10, -10]), 1);
  assert.equal(boxAreaKm2(box, [30, -30]), 9);
});

test("a location with no NISAR pair shows every radar condition as not provided and never passes them", () => {
  const r = buildReadiness({ quality: {}, gridLoaded: false, selectedAsExtreme: false, independentEvidence: ["NASA Landsat 1988 and 2018"], noNisarProduct: true });
  for (const c of r.conditions.filter((x) => x.id !== "independent")) assert.equal(c.status, "NOT_PROVIDED", c.id);
  const independent = r.conditions.find((c) => c.id === "independent");
  assert.equal(independent.status, "PASS"); assert.match(independent.detail, /Context only/);
  assert.equal(r.met, 1);
  const none = buildReadiness({ quality: {}, gridLoaded: false, selectedAsExtreme: false, independentEvidence: [], noNisarProduct: true });
  assert.equal(none.met, 0);
});

test("analysis time stays bounded on a very large grid", () => {
  const g = noiseGrid(1224, 1503, 21), box = { r0: 100, r1: 164, c0: 100, c1: 164 };
  const start = performance.now();
  const r = analyzeBox(g, box);
  assert.ok(r.ok && r.referenceWindows <= 4000 && r.referenceWindows >= 30);
  assert.ok(performance.now() - start < 8000, "analysis took too long");
});

const quality = {
  identificationGroup: "UNVERIFIED for Louisiana; official QA summaries not yet reviewed",
  frequencyAHHAndHVValidity: "UNVERIFIED for Louisiana; official QA reports not yet reviewed",
  gridAlignment: "PASS for selected Frequency A ROI: EPSG:32615, 10 m, 457×404",
  radiometricArtifactsAndNoise: "UNVERIFIED; RFI, noise and possible banding need review",
};

test("QA text maps to statuses conservatively", () => {
  assert.equal(statusFromText("PASS in official decimated-raster checks"), "PASS");
  assert.equal(statusFromText("FAIL on both official QA summaries"), "FAIL");
  assert.equal(statusFromText("UNVERIFIED; RFI"), "UNVERIFIED");
  assert.equal(statusFromText(undefined), "UNVERIFIED");
  assert.equal(statusFromText("Passes nothing"), "UNVERIFIED");
});

test("readiness keeps failed and missing conditions visible and has no overall score field", () => {
  const r = buildReadiness({ quality, gridLoaded: false, selectedAsExtreme: false, independentEvidence: [] });
  assert.equal(r.total, r.conditions.length);
  assert.equal(r.met, 1); // only grid alignment passes
  for (const id of ["identification", "frequency", "artifacts", "grid", "background-HH", "independent"]) {
    assert.notEqual(r.conditions.find((c) => c.id === id).status, "PASS", id);
  }
  assert.equal(r.conditions.find((c) => c.id === "grid").status, "NOT_PROVIDED");
  assert.deepEqual(Object.keys(r).sort(), ["conditions", "met", "total"]);
});

test("region metadata saying official QA failed overrides an unverified status", () => {
  const r = buildReadiness({ quality, regionsWarning: "Both official identification-group QA checks failed; x", gridLoaded: false, selectedAsExtreme: false, independentEvidence: [] });
  const c = r.conditions.find((x) => x.id === "identification");
  assert.equal(c.status, "FAIL"); assert.match(c.detail, /failed/);
});

test("a region selected as an extreme cannot pass the background conditions", () => {
  const g = noiseGrid(240, 240, 13), box = { r0: 100, r1: 140, c0: 100, c1: 140 };
  plant(g, box, 2);
  const a = analyzeBox(g, box);
  const r = buildReadiness({ quality, gridLoaded: true, hh: a, hv: a, selectedAsExtreme: true, candidateWindows: 36, independentEvidence: [] });
  const hh = r.conditions.find((c) => c.id === "background-HH");
  assert.equal(hh.status, "UNVERIFIED"); assert.match(hh.detail, /ranking 36 candidate windows/);
  assert.notEqual(r.conditions.find((c) => c.id === "agreement").status, "PASS");
});

test("a user box that stands out in both polarizations in the same direction passes only those conditions", () => {
  const g = noiseGrid(240, 240, 17), box = { r0: 100, r1: 140, c0: 100, c1: 140 };
  plant(g, box, 1.5);
  const a = analyzeBox(g, box);
  const r = buildReadiness({ quality, gridLoaded: true, hh: a, hv: a, selectedAsExtreme: false, independentEvidence: [] });
  for (const id of ["background-HH", "background-HV", "agreement", "grid"]) assert.equal(r.conditions.find((c) => c.id === id).status, "PASS", id);
  for (const id of ["identification", "frequency", "artifacts", "independent"]) assert.notEqual(r.conditions.find((c) => c.id === id).status, "PASS", id);
  const opposite = { ...a, excessDb: -a.excessDb };
  const r2 = buildReadiness({ quality, gridLoaded: true, hh: a, hv: opposite, selectedAsExtreme: false, independentEvidence: [] });
  assert.equal(r2.conditions.find((c) => c.id === "agreement").status, "FAIL");
});

test("independent evidence is the only way to pass that condition", () => {
  const r = buildReadiness({ quality, gridLoaded: false, selectedAsExtreme: false, independentEvidence: ["USGS gauge record, both dates"] });
  assert.equal(r.conditions.find((c) => c.id === "independent").status, "PASS");
});

test("alternative explanations carry no probabilities and speckle is only partly characterised", () => {
  const without = alternativeExplanations(false), withContext = alternativeExplanations(true);
  assert.ok(without.every((e) => e.assessment === "NOT_ASSESSED"));
  assert.equal(withContext.find((e) => e.id === "speckle").assessment, "PARTLY_CHARACTERISED");
  assert.ok(withContext.filter((e) => e.assessment !== "NOT_ASSESSED").length === 1);
  assert.ok(withContext.every((e) => !/\d%|probab|likel/i.test(e.label + e.wouldHelp)));
});

test("chance-hit expectation grows with the number of boxes inspected", () => {
  assert.equal(expectedChanceHits(0), 0); assert.equal(expectedChanceHits(-3), 0);
  assert.ok(Math.abs(expectedChanceHits(20) - 1) < 1e-12);
});

test("report escapes hostile text everywhere and states it is not a confidence score", () => {
  const evil = `<img src=x onerror=alert(1)>"'&\``;
  const g = noiseGrid(240, 240), box = { r0: 100, r1: 140, c0: 100, c1: 140 };
  const a = analyzeBox(g, box);
  const readiness = buildReadiness({ quality: { ...quality, gridAlignment: `PASS ${evil}` }, gridLoaded: true, hh: a, hv: a, selectedAsExtreme: false, independentEvidence: [evil] });
  const html = buildTrustReport({
    study: evil, boxLabel: evil, box, dates: ["2000-01-01", "2000-01-13"], granules: ["G1-TEST", evil],
    analyses: { HH: a, HV: { ok: false, reason: evil } }, readiness, explanations: [{ id: "x", label: evil, assessment: "NOT_ASSESSED", wouldHelp: evil }],
    selectedAsExtreme: true, candidateWindows: 36, looks: 12, limitations: [evil], warning: evil, generatedAt: "2026-11-15T00:00:00Z",
  });
  assert.ok(!/<img/i.test(html), "raw tag leaked");
  assert.ok(!html.includes(evil));
  assert.match(html, /not a scientific confidence score/);
  assert.match(html, /ranking 36 candidate windows/);
  assert.match(html, /12 boxes were checked/);
  assert.match(html, /conditions met/);
  assert.ok(!/<script/i.test(html) && !/https?:\/\/(?!doi)/i.test(html.replace(/doi\.org/g, "")), "report must be self-contained");
});

test("escaping and filenames are safe", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  assert.equal(reportFilename("Louisiana Delta", "Region A"), "tango-trust-Louisiana-Delta-Region-A.html");
  assert.match(reportFilename("../../etc/passwd", "<x>"), /^tango-trust-[A-Za-z0-9_-]+\.html$/);
  assert.equal(reportFilename("", ""), "tango-trust-box-box.html");
});

test("signed dB text never prints negative zero", () => {
  assert.equal(signedDb(-0.0004), "+0.00"); assert.equal(signedDb(0), "+0.00");
  assert.equal(signedDb(-0.006), "-0.01"); assert.equal(signedDb(1.504), "+1.50");
});
