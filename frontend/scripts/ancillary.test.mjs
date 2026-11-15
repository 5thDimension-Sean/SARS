import test from "node:test";
import assert from "node:assert/strict";
import { parseAncillary, safeHttpsUrl } from "../lib/ancillary.ts";

const layer = (over = {}) => ({ id: "wc", kind: "land_cover", title: "Land cover", source: "Test source", sourceUrl: "https://example.org/d", year: 2021, version: "v1",
  license: "CC BY 4.0", resolutionM: 10, caveat: "Fixture", validFraction: 0.98, classes: [{ label: "Trees", fraction: 0.6 }, { label: "Crops", fraction: 0.4 }], ...over });
const manifest = (l) => ({ studyId: "iowa", layers: [l] });

test("valid categorical and continuous layers parse", () => {
  assert.equal(parseAncillary(manifest(layer()), "iowa")[0].classes.length, 2);
  const pop = layer({ kind: "population", classes: null, total: { value: 1234, unit: "people" } });
  assert.equal(parseAncillary(manifest(pop), "iowa")[0].total.unit, "people");
});
test("a manifest for another study is rejected", () => assert.throws(() => parseAncillary(manifest(layer()), "hawaii")));
test("class shares must sum to one and stay in range", () => {
  assert.throws(() => parseAncillary(manifest(layer({ classes: [{ label: "A", fraction: 0.5 }] })), "iowa"));
  assert.throws(() => parseAncillary(manifest(layer({ classes: [{ label: "A", fraction: 1.5 }, { label: "B", fraction: -0.5 }] })), "iowa"));
});
test("missing summary, bad kind, zero valid data and implausible year are rejected", () => {
  assert.throws(() => parseAncillary(manifest(layer({ classes: null })), "iowa"));
  assert.throws(() => parseAncillary(manifest(layer({ kind: "script" })), "iowa"));
  assert.throws(() => parseAncillary(manifest(layer({ validFraction: 0 })), "iowa"));
  assert.throws(() => parseAncillary(manifest(layer({ year: 1066 })), "iowa"));
  assert.throws(() => parseAncillary(manifest(layer({ license: "" })), "iowa"));
});
test("only plain https source links are accepted", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.org", "//example.org", "https://u:p@example.org", "https://localhost/x"])
    assert.throws(() => safeHttpsUrl(bad), bad);
  assert.equal(safeHttpsUrl("https://esa-worldcover.org/"), "https://esa-worldcover.org/");
});
test("the home globe journey keeps the whole Earth in frame at the start", async () => {
  const { HERO_VIEW, FOCUS_HEIGHT } = await import("../lib/globe-journey.ts");
  assert.ok(HERO_VIEW.height > 2 * 6_371_000 * 0.8 && HERO_VIEW.height > FOCUS_HEIGHT);
});
