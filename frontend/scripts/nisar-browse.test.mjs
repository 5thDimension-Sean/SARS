import test from "node:test";
import assert from "node:assert/strict";
import { DATES, STUDY_BOUNDS, tileUrl, hasComparableCoverage } from "../lib/nisar-browse.ts";

const pixels = () => {
  const data = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = i % 8 ? 80 : 160; data[i + 1] = 140; data[i + 2] = 30; data[i + 3] = 255; }
  return data;
};
test("verified dates use identical geographic tile addresses with WMTS row before column", () => {
  assert.match(tileUrl(DATES[0], 9, 141, 218), /2026-09-30\/GoogleMapsCompatible_Level13\/9\/218\/141.png$/);
  assert.equal(tileUrl(DATES[0]).replace(DATES[0], DATES[1]), tileUrl(DATES[1]));
  assert.throws(() => tileUrl("2026-10-03"), /Unverified/);
  const [west, south, east, north] = STUDY_BOUNDS;
  assert.ok(west < -80.8 && east > -80.8 && south < 25.5 && north > 25.5);
});
test("comparison rejects missing, wrongly sized, transparent and blank imagery", () => {
  assert.equal(hasComparableCoverage(pixels(), new Uint8ClampedArray()), false);
  assert.equal(hasComparableCoverage(pixels(), new Uint8ClampedArray(256 * 256 * 4)), false);
  const blank = pixels();
  for (let i = 0; i < blank.length; i += 4) blank[i] = blank[i + 1] = blank[i + 2] = 0;
  assert.equal(hasComparableCoverage(pixels(), blank), false);
  for (let i = 0; i < blank.length; i += 4) blank[i] = 120;
  assert.equal(hasComparableCoverage(pixels(), blank), false);
});
test("comparison requires overlapping valid pixels, not just independent coverage", () => {
  const a = pixels(), b = pixels();
  assert.equal(hasComparableCoverage(a, b), true);
  for (let i = 0; i < 4000 * 4; i += 4) b[i + 3] = 0;
  assert.equal(hasComparableCoverage(a, b), false);
});
