import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STUDIES, parsePreview } from "../lib/investigation.ts";
import { studyFromHash } from "../lib/view-store.ts";

const read = p => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const summary = read("palm-review/palm-summary.json");
const study = STUDIES.find(s => s.id === "palm");

test("Palm study is registered with correct NASA acquisition metadata and scientific status", () => {
  assert.ok(study);
  assert.equal(studyFromHash("#palm"), "palm");
  assert.deepEqual(study.dates, summary.dates);
  assert.deepEqual(study.granules, summary.sourceGranules);
  assert.equal(study.utmZone, 40);
  assert.equal(study.previewDir, "palm-preview");
  assert.equal(summary.scientificStatus, "EXPLORATORY_NOT_CLEARED");
  assert.equal(summary.crs, "EPSG:32640");
  assert.ok(summary.warnings.some(w => /identification.*QA fail/i.test(w)));
  assert.ok(summary.warnings.some(w => /no[t]? establish.*cause|do not establish.*cause/i.test(w)));
});

test("Palm native grid is exactly aligned and paired measurements are finite", () => {
  assert.deepEqual(summary.nativeShape, [451, 511]);
  assert.deepEqual(summary.nativeGrid.spacing, [10, -10]);
  for (const a of summary.acquisitions) {
    assert.deepEqual(a.grid, summary.nativeGrid);
    assert.equal(a.identity.trackNumber, 78);
    assert.equal(a.identity.frameNumber, 76);
  }
  for (const pol of ["HH", "HV"]) {
    const stats = summary.polStats[pol];
    assert.equal(stats.commonValidPixels, 230461);
    assert.ok(stats.commonValidPixels <= summary.nativeShape[0]*summary.nativeShape[1]);
    for (const k of ["pairedDifferenceMedianDb", "pairedDifferenceMeanDb", "date1MedianDbOnCommonPixels", "date2MedianDbOnCommonPixels"]) assert.ok(Number.isFinite(stats[k]), `${pol}: ${k}`);
  }
});

test("Palm imagery is real published PNG data with exact source hashes", () => {
  const preview = parsePreview(read("palm-preview/preview-manifest.json"), study);
  assert.deepEqual(preview.acquisitions.map(a=>a.conceptId), summary.sourceGranules);
  assert.equal(preview.scientificClearance, summary.scientificStatus);
  const files = ["20261005_HH.png","20261005_HV.png","20261017_HH.png","20261017_HV.png","HH_difference_exploratory.png","HV_difference_exploratory.png"];
  assert.deepEqual(Object.keys(summary.images).sort(), files.sort());
  for (const name of files) {
    const bytes = readFileSync(new URL(`../public/data/palm-review/${name}`, import.meta.url));
    assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 511);
    assert.equal(bytes.readUInt32BE(20), 451);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), summary.images[name]);
  }
  for (const a of preview.acquisitions) for (const pol of ["HH", "HV"]) {
    const im=a.images[pol];
    const bytes=readFileSync(new URL(`../public/data/palm-preview/${im.filename}`,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), im.sha256);
    assert.equal(im.screenedPixels, summary.polStats[pol].commonValidPixels);
  }
});
