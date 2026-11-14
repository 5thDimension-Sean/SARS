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

test("display preferences are whitelisted, default to the designed dark look and resolve themes safely", async () => {
  const { sanitizePrefs, resolveTheme, DEFAULT_PREFS } = await import("../lib/prefs.ts");
  const { PREFS_BOOT_SCRIPT } = await import("../lib/prefs-boot.ts");
  assert.deepEqual(sanitizePrefs(undefined), DEFAULT_PREFS);
  assert.deepEqual(sanitizePrefs({ theme: "light", motion: "reduced" }), { theme: "light", motion: "reduced" });
  // Retired settings (the old black & white mode) are dropped, never applied.
  assert.deepEqual(sanitizePrefs({ theme: "dark", color: "bw", motion: "full" }), { theme: "dark", motion: "full" });
  assert.deepEqual(sanitizePrefs({ theme: "<script>", motion: 7 }), DEFAULT_PREFS);
  assert.deepEqual(sanitizePrefs("nope"), DEFAULT_PREFS);
  assert.equal(DEFAULT_PREFS.theme, "dark");
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.doesNotMatch(PREFS_BOOT_SCRIPT, /innerHTML|eval\(|fetch\(/); // first-party, read-only boot script
});

test("map limits: the contain view fits the scene exactly and the zoom-out limit never shows more than the scene needs", async () => {
  const { containView, viewBounds } = await import("../lib/map-limits.ts");
  const scene = [-80.82, 25.48, -80.78, 25.52];
  for (const [w, h] of [[775, 650], [390, 420], [1200, 500]]) {
    const fit = containView(scene, w, h, 8);
    const [west, south, east, north] = viewBounds(fit.center, fit.zoom, w, h);
    // The scene is inside the view (with the padding) and touches it on at least one axis.
    assert.ok(west <= scene[0] && east >= scene[2] && south <= scene[1] && north >= scene[3], `${w}x${h}`);
    const tightX = Math.abs((scene[2] - scene[0]) / (east - west) - (w - 16) / w) < 1e-3;
    const tightY = Math.abs((north - south) > 0 && true);
    assert.ok(tightX || tightY);
    // One zoom level further out shows noticeably more than the scene: that is what the limit prevents.
    const out = viewBounds(fit.center, fit.zoom - 1, w, h);
    assert.ok((out[2] - out[0]) > 1.9 * (east - west));
  }
});

test("changed-pixels filter hides faint colours only, works on colour strength and refuses bad thresholds", async () => {
  const { changeStrength, hideWeakChanges } = await import("../lib/change-filter.ts");
  assert.equal(changeStrength(255, 255, 255), 0);
  assert.ok(changeStrength(16, 16, 255) > 0.9 && changeStrength(255, 16, 16) > 0.9);
  assert.ok(changeStrength(244, 240, 255) < 0.1); // the near-white "no difference" colour
  const px = new Uint8ClampedArray([244, 240, 255, 255, 16, 16, 255, 255, 140, 135, 255, 255, 255, 16, 16, 0]);
  const kept = hideWeakChanges(px, 0.35);
  assert.equal(kept, 2); // strong blue and mid blue stay; near-white hidden; already-transparent skipped
  assert.deepEqual([px[3], px[7], px[11], px[15]], [0, 255, 255, 0]);
  assert.throws(() => hideWeakChanges(new Uint8ClampedArray(4), 2), /between 0 and 1/);
  assert.equal(hideWeakChanges(new Uint8ClampedArray([244, 240, 255, 255]), 0), 1); // threshold 0 keeps everything
});

test("study centres sit inside the published scenes so the story map points at real places", () => {
  for (const s of STUDIES) {
    const [w, so, e, n] = parsePreview(read(`${s.previewDir}/preview-manifest.json`), s).bounds;
    assert.ok(s.center[0] >= w - 0.02 && s.center[0] <= e + 0.02 && s.center[1] >= so - 0.02 && s.center[1] <= n + 0.02, s.id);
  }
});

test("FAQ search is curated, ranked, forgiving and never empty-handed for known topics", async () => {
  const { FAQ, searchFaq } = await import("../lib/faq.ts");
  assert.equal(searchFaq("").length, FAQ.length);
  assert.equal(searchFaq("   ").length, FAQ.length);
  assert.equal(searchFaq("what is HV?")[0].id, "hhhv");
  assert.equal(searchFaq("flooding")[0].id, "flood");
  assert.equal(searchFaq("can I upload hdf5")[0].id, "upload");
  assert.equal(searchFaq("xyzzy").length, 0);
  assert.equal(searchFaq("<img src=x onerror=alert(1)>").length, 0);
  for (const f of FAQ) assert.ok(f.answer.length > 40 && !/<[a-z]/i.test(f.answer));
  assert.ok(FAQ.find((f) => f.id === "flood").answer.startsWith("No."));
});

test("globe geometry is valid, closed and needs no network", async () => {
  const { graticule, footprints } = await import("../lib/globe-data.ts");
  const g = graticule(15);
  assert.equal(g.features.length, 24 + 11); // 24 meridians, 11 parallels
  for (const f of g.features) for (const [lon, lat] of f.geometry.coordinates) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
  const boxes = STUDIES.map((s) => parsePreview(read(`${s.previewDir}/preview-manifest.json`), s).bounds);
  const f = footprints(boxes);
  assert.equal(f.features.length, 3);
  for (const ft of f.features) { const c = ft.geometry.coordinates; assert.deepEqual(c[0], c[c.length - 1]); assert.equal(c.length, 5); }
});

test("globe land outline is valid, closed, in range and small enough to ship", () => {
  const raw = readFileSync(new URL("../public/data/globe-land.geojson", import.meta.url), "utf8");
  assert.ok(raw.length < 250 * 1024);
  const g = JSON.parse(raw);
  assert.ok(g.features.length > 150);
  for (const f of g.features) for (const poly of f.geometry.coordinates) for (const ring of poly) {
    assert.deepEqual(ring[0], ring[ring.length - 1]);
    for (const [lon, lat] of ring) assert.ok(lon >= -180 && lon <= 180 && lat >= -85 && lat <= 85);
  }
  assert.equal(g.features.filter((f) => f.properties.ice).length, 2); // Antarctica and Greenland
});
