import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STUDIES, parseContext, parseEvidence, parseRegions, parsePreview, utmToLonLat, rasterCorners, ringBounds,
  fmtSignedDb, fmtDb, dataUrl, describeRegion, describeStudyShift, histogramShares, histogramOverlap, qaState,
} from "../lib/investigation.ts";
import { studyFromHash } from "../lib/view-store.ts";

const read = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const load = (s) => ({
  evidence: parseEvidence(read(`${s.evidenceDir}/evidence.json`), s),
  regions: parseRegions(read(`${s.regionsDir}/regions.json`), read(`${s.regionsDir}/regions.geojson`), s),
});

test("published evidence and regions validate for both studies", () => {
  for (const s of STUDIES) {
    const { evidence, regions } = load(s);
    assert.equal(regions.regions.length, 3);
    assert.equal(regions.scientificStatus, "EXPLORATORY_NOT_CLEARED");
    for (const pol of ["HH", "HV"]) assert.equal(evidence.pols[pol].bins.length, 48);
  }
});

test("Everglades whole-study medians come from the data, not hard-coded text", () => {
  const { evidence } = load(STUDIES[0]);
  assert.equal(fmtSignedDb(evidence.pols.HH.differenceOfRegionalMediansDb), "+0.02 dB");
  assert.equal(fmtSignedDb(evidence.pols.HV.differenceOfRegionalMediansDb), "−0.18 dB");
});

test("region statistics match the published A/B/C numbers", () => {
  const { regions } = load(STUDIES[0]);
  const by = Object.fromEntries(regions.regions.map((r) => [r.id, r]));
  assert.equal(by.A.stats.HH.paired.medianDifferenceDb, 0.591);
  assert.equal(by.B.stats.HV.paired.medianDifferenceDb, -0.467);
  assert.equal(by.C.stats.HH.paired.medianDifferenceDb, 0.015);
});

test("UTM inverse reproduces the published region polygons from row/column windows", () => {
  for (const s of STUDIES) {
    const { regions } = load(s);
    const [dx, dy] = regions.pixelSpacingMeters;
    const [x0, y0] = regions.firstPixelCenter;
    for (const r of regions.regions) {
      const left = x0 - dx / 2 + r.columnRange[0] * dx, right = x0 - dx / 2 + r.columnRange[1] * dx;
      const top = y0 - dy / 2 + r.rowRange[0] * dy, bottom = y0 - dy / 2 + r.rowRange[1] * dy;
      const expected = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([e, n]) => utmToLonLat(e, n, s.utmZone));
      const [w, so, e, n] = ringBounds(r.ring);
      const [ew, es, ee, en] = ringBounds(expected);
      // 1e-5 degrees is about one metre.
      for (const [got, want] of [[w, ew], [so, es], [e, ee], [n, en]]) assert.ok(Math.abs(got - want) < 2e-5, `${s.id} ${r.id}: ${got} vs ${want}`);
    }
  }
});

test("raster corners place the Everglades difference map inside the verified preview extent", () => {
  const { regions } = load(STUDIES[0]);
  const preview = parsePreview(read("everglades-preview/preview-manifest.json"), STUDIES[0]);
  const corners = rasterCorners(regions, 17);
  const [w, s, e, n] = preview.bounds;
  for (const [lon, lat] of corners) assert.ok(lon > w - 0.002 && lon < e + 0.002 && lat > s - 0.002 && lat < n + 0.002);
});

test("malformed, mismatched and over-claiming inputs are rejected", () => {
  const s = STUDIES[0];
  const ev = read("everglades-evidence/evidence.json");
  const bad = structuredClone(ev); bad.polarizations.HH.histogramBins[3].sep30Count += 1;
  assert.throws(() => parseEvidence(bad, s), /reconcile/);
  const wrongDates = structuredClone(ev); wrongDates.dates = ["2026-09-29", "2026-10-11"];
  assert.throws(() => parseEvidence(wrongDates, s), /dates/);
  const nan = structuredClone(ev); nan.polarizations.HV.observations[0].medianDb = null;
  assert.throws(() => parseEvidence(nan, s), /Invalid number/);
  const skew = structuredClone(ev); skew.polarizations.HV.differenceOfRegionalMediansDb = 1;
  assert.throws(() => parseEvidence(skew, s), /do not match/);
  assert.throws(() => parseEvidence(ev, STUDIES[1]), /dates/);
  const meta = read("everglades-regions/regions.json"), geo = read("everglades-regions/regions.geojson");
  const claim = structuredClone(meta); claim.regions[0].environmentalConclusion = "flooding";
  assert.throws(() => parseRegions(claim, geo, s), /environmental conclusion/);
  const cleared = structuredClone(meta); cleared.scientificStatus = "CLEARED";
  assert.throws(() => parseRegions(cleared, geo, s), /exploratory/);
  assert.throws(() => parseRegions(meta, { features: [] }, s), /no polygon/);
  assert.throws(() => parseRegions(meta, geo, STUDIES[1]), /dates/);
});

test("Louisiana real previews validate and reject the Everglades pair", () => {
  assert.equal(STUDIES[1].previewDir, "louisiana-preview");
  assert.equal(STUDIES[1].gibsContext, false);
  const preview = parsePreview(read("louisiana-preview/preview-manifest.json"), STUDIES[1]);
  assert.deepEqual(preview.acquisitions.map(a => a.date), [...STUDIES[1].dates]);
  for (const acquisition of preview.acquisitions) for (const pol of ["HH", "HV"]) {
    assert.equal(acquisition.images[pol].filename, `${acquisition.date.replaceAll("-", "")}_${pol}.png`);
    assert.ok(readFileSync(new URL(`../public/data/louisiana-preview/${acquisition.images[pol].filename}`, import.meta.url)).length > 1000);
  }
  assert.throws(() => parsePreview(read("everglades-preview/preview-manifest.json"), STUDIES[1]), /does not match/);
});

test("region warnings never claim official QA failed when evidence says UNVERIFIED", () => {
  for (const s of STUDIES) {
    const ev = read(`${s.evidenceDir}/evidence.json`);
    const region = read(`${s.regionsDir}/regions.json`);
    if (qaState(ev.quality.identificationGroup) === "unverified") {
      assert.doesNotMatch(JSON.stringify(region), /official QA[^.]*fail|identification[^.]*fail/i, s.id);
    }
  }
});

test("formatting uses signed, unit-bearing numbers and avoids negative zero", () => {
  assert.equal(fmtSignedDb(0.0001), "+0.00 dB");
  assert.equal(fmtSignedDb(-0.0001), "+0.00 dB");
  assert.equal(fmtSignedDb(-0.467, 3), "−0.467 dB");
  assert.equal(fmtDb(-19.5217), "−19.52 dB");
});

test("plain-language text states numbers and never asserts a physical cause", () => {
  for (const s of STUDIES) {
    const { evidence, regions } = load(s);
    const texts = [];
    for (const pol of ["HH", "HV"]) {
      texts.push(describeStudyShift(pol, evidence.pols[pol], s.dates));
      for (const r of regions.regions) texts.push(describeRegion(pol, r, s.dates));
    }
    for (const t of texts) assert.doesNotMatch(t, /flood|vegetation loss|deforest|damage|water|confident|detected/i);
  }
  const { regions } = load(STUDIES[0]);
  assert.match(describeRegion("HH", regions.regions[0], STUDIES[0].dates), /\+0\.591 dB/);
  assert.match(describeRegion("HV", regions.regions[2], STUDIES[0].dates), /essentially unchanged/);
});

test("histogram shares sum to one per date", () => {
  const { evidence } = load(STUDIES[1]);
  const h = histogramShares(evidence.pols.HV);
  for (const i of [0, 1]) assert.ok(Math.abs(h.reduce((s, b) => s + b.shares[i], 0) - 1) < 1e-9);
});

test("histogram overlap is a bounded descriptive number reported in the study summary", () => {
  for (const s of STUDIES) {
    const { evidence } = load(s);
    for (const pol of ["HH", "HV"]) {
      const o = histogramOverlap(evidence.pols[pol]);
      assert.ok(o > 0 && o <= 1);
      assert.match(describeStudyShift(pol, evidence.pols[pol], s.dates), new RegExp(`${Math.round(o * 100)}% of their area`));
    }
  }
});

test("QA wording is classified conservatively and data URLs respect the base path", () => {
  assert.equal(qaState("FAIL on both official QA summaries"), "fail");
  assert.equal(qaState("PASS for selected ROI"), "pass");
  assert.equal(qaState("UNVERIFIED; needs review"), "unverified");
  assert.equal(qaState("anything else"), "unverified");
  assert.equal(dataUrl("a/b.json", "/SARS"), "/SARS/data/a/b.json");
  assert.equal(dataUrl("a/b.json", ""), "/data/a/b.json");
  assert.throws(() => dataUrl("../secret"), /Unsafe/);
  assert.throws(() => dataUrl("https://evil.example/x"), /Unsafe/);
});

test("California validates end to end and is aligned with its own published region polygons", () => {
  const s = STUDIES.find((x) => x.id === "california");
  const { evidence, regions } = load(s);
  assert.equal(regions.regions.length, 3);
  assert.equal(regions.scientificStatus, "EXPLORATORY_NOT_CLEARED");
  const preview = parsePreview(read("california-preview/preview-manifest.json"), s);
  assert.deepEqual(preview.acquisitions.map((a) => a.conceptId), [...s.granules]);
  // Identification QA failure must be surfaced to users as FAIL, not softened.
  const states = evidence.quality.map(([, text]) => qaState(text));
  assert.ok(states.includes("fail") && states.includes("unverified"));
  assert.throws(() => parsePreview(read("everglades-preview/preview-manifest.json"), s), /does not match/);
});

test("context photographs are credited, same-directory JPEGs from the declared source and never measurements", () => {
  const ctx = parseContext(read("california-context/context.json"));
  assert.equal(ctx.photos.length, 3);
  assert.match(ctx.notice, /not NISAR measurements/);
  for (const p of ctx.photos) { assert.ok(p.credit && p.rights && p.sourceUrl.startsWith("https://www.dvidshub.net/")); assert.match(p.usage, /not geographically matched/); }
  const bad = (patch) => ({ ...read("california-context/context.json"), photos: [{ ...read("california-context/context.json").photos[0], ...patch }] });
  assert.throws(() => parseContext(bad({ imageFile: "../secret.jpg" })), /Unsafe/);
  assert.throws(() => parseContext(bad({ sourceUrl: "https://evil.example/image/1/x" })), /source/);
  assert.throws(() => parseContext(bad({ sourceUrl: "javascript:alert(1)" })), /source/);
  assert.throws(() => parseContext({ photos: [] }), /malformed/);
});

test("wildfire context never leaks into radar wording", () => {
  const s = STUDIES.find((x) => x.id === "california");
  const { evidence, regions } = load(s);
  for (const pol of ["HH", "HV"]) {
    const texts = [describeStudyShift(pol, evidence.pols[pol], s.dates), ...regions.regions.map((r) => describeRegion(pol, r, s.dates))];
    for (const t of texts) assert.doesNotMatch(t, /fire|burn|wildfire|damage|vegetation|flood|plaskett/i);
  }
});

test("location fragments map to known studies and unknown input falls back safely", () => {
  assert.equal(studyFromHash("#california"), "california");
  assert.equal(studyFromHash("louisiana"), "louisiana");
  assert.equal(studyFromHash(""), "everglades");
  assert.equal(studyFromHash("#<script>alert(1)</script>"), "everglades");
  assert.equal(studyFromHash("#__proto__"), "everglades");
});
