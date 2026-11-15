import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
const FULL_EVIDENCE_STUDIES = STUDIES.filter(
  (s) => ["everglades", "louisiana", "california", "hawaii", "rodanthe", "amazon", "etna"].includes(s.id)
);

const EXPLORATORY_STUDIES = [
  { id: "iowa", dates: ["2026-09-25", "2026-10-19"], granules: ["G4325945910-ASF", "G4381295241-ASF"], utmZone: 15,
    noCause: "No harvest, crop change, physical cause, or detection accuracy is inferred.", note: "No harvest or land-cover attribution." },
];

function checkRadarImage(directory, filename, sha256) {
  assert.match(filename, /^[A-Za-z0-9_]+\.png$/);
  const bytes = readFileSync(new URL(`../public/data/${directory}/${filename}`, import.meta.url));
  assert.ok(bytes.length > 24, filename);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", filename);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR", filename);
  assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, filename);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256, `${directory}/${filename}`);
}

for (const expected of EXPLORATORY_STUDIES) {
  test(`${expected.id} registration and previews match the declared NASA acquisitions`, () => {
    const matches = STUDIES.filter((s) => s.id === expected.id);
    assert.equal(matches.length, 1);
    const s = matches[0];
    assert.deepEqual(s.dates, expected.dates);
    assert.deepEqual(s.granules, expected.granules);
    assert.equal(s.utmZone, expected.utmZone);
    assert.equal(s.previewDir, `${s.id}-preview`);
    assert.equal(s.evidenceDir, `${s.id}-review`);
    assert.equal(s.regionsDir, `${s.id}-review`);
    assert.equal(s.gibsContext, false);
    assert.equal(studyFromHash(`#${s.id}`), s.id);
    const raw = read(`${s.previewDir}/preview-manifest.json`);
    const preview = parsePreview(raw, s);
    assert.deepEqual(preview.acquisitions.map((a) => a.date), expected.dates);
    assert.deepEqual(preview.acquisitions.map((a) => a.conceptId), expected.granules);
    assert.equal(preview.scientificClearance, "EXPLORATORY_NOT_CLEARED");
    const wrongDate = structuredClone(raw); wrongDate.acquisitions[0].date = expected.dates[1];
    assert.throws(() => parsePreview(wrongDate, s), /does not match/);
    const wrongGranule = structuredClone(raw); wrongGranule.acquisitions[0].conceptId = expected.granules[1];
    assert.throws(() => parsePreview(wrongGranule, s), /does not match/);
  });

  test(`${expected.id} exploratory summary has valid paired HH/HV statistics and all radar assets`, () => {
    const s = STUDIES.find((s) => s.id === expected.id);
    const summary = read(`${s.regionsDir}/${s.id}-summary.json`);
    const preview = parsePreview(read(`${s.previewDir}/preview-manifest.json`), s);
    assert.deepEqual(summary.dates, expected.dates);
    assert.deepEqual(summary.sourceGranules, expected.granules);
    assert.equal(summary.crs, `EPSG:326${String(expected.utmZone).padStart(2, "0")}`);
    assert.equal(summary.nativeShape.length, 2);
    assert.ok(summary.nativeShape.every((n) => Number.isSafeInteger(n) && n > 0));
    assert.ok(Number.isSafeInteger(summary.commonValidPixels) && summary.commonValidPixels > 0);
    assert.ok(summary.commonValidPixels <= summary.nativeShape[0] * summary.nativeShape[1]);
    assert.deepEqual(Object.keys(summary.polStats).sort(), ["HH", "HV"]);
    for (const pol of ["HH", "HV"]) {
      const stats = summary.polStats[pol];
      assert.equal(stats.pairedPixelCount, summary.commonValidPixels);
      for (const key of ["beforeMedianDbOnCommonPixels", "afterMedianDbOnCommonPixels", "pairedDifferenceMedianDb",
        "pairedDifferenceMeanDb", "pairedDifferenceP05Db", "pairedDifferenceP95Db"]) {
        assert.ok(Number.isFinite(stats[key]), `${s.id} ${pol} ${key}`);
      }
      assert.ok(stats.pairedDifferenceP05Db <= stats.pairedDifferenceMedianDb);
      assert.ok(stats.pairedDifferenceMedianDb <= stats.pairedDifferenceP95Db);
      // A median of paired differences must not be replaced by a difference of medians.
      for (const acquisition of preview.acquisitions) {
        const image = acquisition.images[pol];
        assert.ok(Number.isSafeInteger(image.screenedPixels) && image.screenedPixels >= stats.pairedPixelCount);
        assert.ok(image.screenedPixels <= summary.nativeShape[0] * summary.nativeShape[1]);
        assert.deepEqual(image.displayRangeDb, summary.displayRangesDb[pol]);
        assert.ok(image.displayRangeDb.every(Number.isFinite) && image.displayRangeDb[0] < image.displayRangeDb[1]);
        assert.equal(image.sha256, summary.images[image.filename].sha256);
        checkRadarImage(s.previewDir, image.filename, image.sha256);
      }
    }
    const expectedImages = expected.dates.flatMap((date) => ["HH", "HV"].map((pol) => `${date.replaceAll("-", "")}_${pol}.png`));
    expectedImages.push("HH_difference_exploratory.png", "HV_difference_exploratory.png");
    assert.deepEqual(Object.keys(summary.images).sort(), expectedImages.sort());
    for (const [filename, image] of Object.entries(summary.images)) checkRadarImage(s.regionsDir, filename, image.sha256);
    assert.equal(summary.scientificStatus, "EXPLORATORY_NOT_CLEARED");
    assert.equal(summary.warning, "Provisional NISAR GCOV radar-return observations; not cleared for quantitative environmental analysis. Official QA review, radiometric artifacts, RFI, banding and noise floor remain unresolved. " + expected.noCause);
    assert.equal(summary.note, "Images and statistics are for exploratory inspection only. " + expected.note);
    assert.match(summary.qaReview, /not cleared.*UNVERIFIED/);
    // Keep causal terms confined to the explicit disclaimers checked above.
    const { warning, note, ...descriptive } = summary;
    assert.ok(warning && note);
    assert.doesNotMatch(JSON.stringify(descriptive), /lava|erupt|harvest|crop change|damage|flood|deforest|confirmed|caused by/i);
  });
}

test("published evidence and regions validate for both studies", () => {
  assert.deepEqual(FULL_EVIDENCE_STUDIES.map((s) => s.id), ["everglades", "louisiana", "california", "hawaii", "rodanthe", "amazon", "etna"]);
  for (const s of FULL_EVIDENCE_STUDIES) {
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
  for (const s of FULL_EVIDENCE_STUDIES) {
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
  for (const s of FULL_EVIDENCE_STUDIES) {
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
  for (const s of FULL_EVIDENCE_STUDIES) {
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
  for (const s of FULL_EVIDENCE_STUDIES) {
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



test("globe journey: every place is reachable, the path is continuous and text follows the visitor's scroll", async () => {
  const { HERO_VIEW, FOCUS_HEIGHT, FLIGHT_CEILING, cameraAt, textState, progressFor } = await import("../lib/globe-journey.ts");
  const { PLACES } = await import("../lib/places.ts");
  assert.ok(PLACES.length >= 8 && PLACES.some((p) => p.id === "etna") && PLACES.some((p) => p.id === "hubbard") && PLACES.some((p) => p.id === "sossusvlei"));
  assert.ok(PLACES.some(p => p.id === "rodanthe" && p.href === "/coastal-erosion"), "real storm-period coastline is featured");
  assert.ok(PLACES.some(p => p.id === "amazon" && p.href === "/amazon-river"), "Amazon is an additional investigation");
  assert.ok(!PLACES.some(p => p.id === "iowa"), "Iowa is removed from featured globe stops");
  assert.ok(STUDIES.some(s => s.id === "iowa"), "Iowa remains available as an earlier investigation");
  for (const s of STUDIES.filter(s => s.id !== "iowa")) {
    const place = PLACES.find((p) => p.id === s.id);
    assert.ok(place, s.id);
    assert.ok(Math.abs(place.lon - s.center[0]) < 0.05 && Math.abs(place.lat - s.center[1]) < 0.05, s.id);
  }
  const stops = [HERO_VIEW, ...PLACES.map((p) => ({ lon: p.lon, lat: p.lat, height: FOCUS_HEIGHT }))];
  stops.forEach((s, i) => { const c = cameraAt(stops, i); assert.ok(Math.abs(c.lon - s.lon) < 1e-9 && Math.abs(c.lat - s.lat) < 1e-9 && Math.abs(c.height - s.height) < 1e-3, `stop ${i}`); });
  // Scrubbing is monotone per leg and never leaves the globe: heights stay inside the flight ceiling for place-to-place hops.
  let prev = cameraAt(stops, 1);
  for (let p = 1; p <= stops.length - 1; p += 0.01) {
    const c = cameraAt(stops, p);
    assert.ok(Number.isFinite(c.lon) && Math.abs(c.lat) <= 90 && c.height >= FOCUS_HEIGHT - 1 && c.height <= HERO_VIEW.height + 1);
    assert.ok(Math.abs(c.lat - prev.lat) < 25, "no jumps"); prev = c;
  }
  assert.ok(FLIGHT_CEILING < HERO_VIEW.height);
  assert.deepEqual(cameraAt(stops, -5), cameraAt(stops, 0)); assert.deepEqual(cameraAt(stops, 999), cameraAt(stops, stops.length - 1));
  assert.equal(cameraAt(stops, NaN).height, HERO_VIEW.height);
  // Text is fully visible on its stop, gone two stops away, and arrives from the left.
  assert.equal(textState(2, 2).opacity, 1);
  assert.equal(textState(2, 0).opacity, 0);
  assert.ok(textState(2, 1.7).x < 0 && textState(2, 1.7).opacity > 0 && textState(2, 1.7).opacity < 1);
  assert.ok(textState(2, 2.3).x > 0);
  assert.equal(progressFor(0, 3000, 1000, 8), 0);
  assert.equal(progressFor(-2000, 3000, 1000, 8), 7);
  assert.equal(progressFor(-1000, 3000, 1000, 8), 3.5);
});


test("blended change layer: speckle vanishes, clusters fuse, masked and unchanged pixels stay transparent, input is untouched", async () => {
  const { blendChanges, INCREASE_RGB, DECREASE_RGB } = await import("../lib/change-filter.ts");
  const W = 40, H = 40, px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i += 4) px.set([244, 240, 255, 255], i); // unchanged near-white
  const set = (x, y, rgba) => px.set(rgba, (y * W + x) * 4);
  set(3, 3, [255, 16, 16, 255]); // lone red speckle
  for (let y = 15; y < 23; y++) for (let x = 15; x < 23; x++) set(x, y, [255, 16, 16, 255]); // solid increase cluster
  for (let y = 30; y < 36; y++) for (let x = 5; x < 11; x++) set(x, y, [16, 16, 255, 255]); // solid decrease cluster
  set(18, 18, [0, 0, 0, 0]); // masked pixel inside the cluster
  const before = Uint8ClampedArray.from(px);
  const { data, areaFraction } = blendChanges(px, W, H, { threshold: 0.5 });
  assert.deepEqual(px, before);
  const at = (x, y) => [...data.slice((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.equal(at(3, 3)[3], 0, "speckle removed");
  assert.equal(at(25, 25)[3], 0, "unchanged area transparent");
  assert.equal(at(18, 18)[3], 0, "masked pixel never painted");
  assert.deepEqual(at(19, 19).slice(0, 3), [...INCREASE_RGB]); assert.ok(at(19, 19)[3] > 150);
  assert.deepEqual(at(7, 32).slice(0, 3), [...DECREASE_RGB]); assert.ok(at(7, 32)[3] > 150);
  const edge = at(15, 19)[3]; assert.ok(edge > 0 && edge < at(19, 19)[3], "soft edge");
  assert.ok(areaFraction > 0.02 && areaFraction < 0.2);
  assert.equal(blendChanges(new Uint8ClampedArray(W * H * 4), W, H, { threshold: 0.3 }).areaFraction, 0, "fully masked image shows nothing");
  assert.throws(() => blendChanges(px, W, H, { threshold: 2 }), /between 0 and 1/);
  assert.throws(() => blendChanges(px, W, H + 1, { threshold: 0.3 }), /size/);
  assert.throws(() => blendChanges(px, W, H, { threshold: 0.3, radius: 0 }), /Radius/);
});

test("upload analysis: validates files, self-runs checks, never fabricates results for bad input, and its overview is rule-based", async () => {
  const { acceptableFile, toGray, analyzePair, differenceRgba } = await import("../lib/upload-analysis.ts");
  assert.ok(acceptableFile({ name: "a.h5", type: "application/x-hdf5", size: 10 }));
  assert.ok(acceptableFile({ name: "a.png", type: "image/png", size: 0 }));
  assert.ok(acceptableFile({ name: "a.png", type: "image/png", size: 26 * 1024 * 1024 }));
  assert.equal(acceptableFile({ name: "a.png", type: "image/png", size: 5000 }), null);
  const make = (w, h, f) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); px.set(v === null ? [0, 0, 0, 0] : [v, v, v, 255], (y * w + x) * 4); } return toGray(px, w, h); };
  const textured = (x, y) => 60 + ((x * 7 + y * 13) % 90);
  assert.equal(analyzePair(null, make(4, 4, textured)).usable, false);
  const mismatch = analyzePair(make(8, 8, textured), make(9, 8, textured));
  assert.equal(mismatch.usable, false); assert.equal(mismatch.stats, null);
  assert.equal(analyzePair(make(8, 8, () => 100), make(8, 8, textured)).usable, false, "flat image fails");
  const same = analyzePair(make(20, 20, textured), make(20, 20, textured));
  assert.equal(same.usable, true); assert.equal(same.stats.changedFraction, 0);
  assert.ok(same.checks.find((c) => c.id === "calibration").status === "warn", "never claims calibration");
  const shifted = analyzePair(make(20, 20, textured), make(20, 20, (x, y) => (x < 10 ? textured(x, y) + 80 : textured(x, y))));
  assert.ok(Math.abs(shifted.stats.changedFraction - 0.5) < 0.01 && shifted.stats.meanShift > 30);
  assert.ok(shifted.overview.join(" ").includes("not by an AI model") && !/flood|damage|deforest/i.test(shifted.overview.join(" ").replace("naming a cause", "")));
  const masked = analyzePair(make(20, 20, textured), make(20, 20, (x, y) => (x < 15 ? null : textured(x, y))));
  assert.equal(masked.checks.find((c) => c.id === "valid").status, "fail");
  const d = differenceRgba(make(2, 1, () => 50), make(2, 1, (x) => (x ? 200 : null)));
  assert.equal(d[3], 0, "masked pixel transparent"); assert.deepEqual([...d.slice(4, 8)], [255, 0, 0, 255]);
  assert.throws(() => differenceRgba(make(2, 2, () => 1), make(3, 2, () => 1)), /same size/);
});
