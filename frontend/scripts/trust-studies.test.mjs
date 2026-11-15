import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TRUST_LOCATIONS, DEFAULT_LOCATION, findLocation } from "../lib/trust-studies.ts";

const data = join(dirname(fileURLToPath(import.meta.url)), "../public/data");
const json = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
const grid = TRUST_LOCATIONS.filter((l) => l.kind === "grid");

test("every published *-regions folder is covered by the trust layer", () => {
  const known = new Set(grid.map((l) => l.regionsDir));
  const published = readdirSync(data).filter((d) => d.endsWith("-regions"));
  assert.ok(published.length >= 7, "expected the published study folders to exist");
  for (const dir of published) assert.ok(known.has(dir), `${dir} is published but missing from lib/trust-studies.ts`);
});

test("registry ids are unique, the default exists, and every location has plain-language text", () => {
  const ids = TRUST_LOCATIONS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(findLocation(DEFAULT_LOCATION));
  for (const l of TRUST_LOCATIONS) {
    assert.ok(l.label.length > 3, l.id);
    if (l.kind === "none") assert.ok(l.reason.length > 40, l.id);
  }
  for (const id of ["padma", "hubbard", "sossusvlei", "custom"]) assert.ok(findLocation(id), id);
  assert.equal(findLocation("padma").kind, "none");
});

test("published studies share the schema the page relies on, with regions inside the grid", () => {
  for (const l of grid) {
    if (!existsSync(join(data, l.regionsDir, "regions.json"))) continue; // custom coordinate may be unpublished
    const regions = json(join(data, l.regionsDir, "regions.json"));
    const evidence = json(join(data, l.evidenceDir, "evidence.json"));
    const [rows, cols] = regions.nativeShape;
    assert.ok(Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0, l.id);
    assert.equal(regions.dates.length, 2, l.id); assert.equal(regions.sourceGranules.length, 2, l.id);
    assert.ok(evidence.quality && typeof evidence.quality.identificationGroup === "string", `${l.id} quality`);
    assert.ok(Array.isArray(evidence.limitations) && evidence.limitations.length > 0, `${l.id} limitations`);
    assert.ok(regions.regions.length >= 1, l.id);
    for (const r of regions.regions) {
      const [r0, r1] = r.rowRange, [c0, c1] = r.columnRange;
      assert.ok(r0 >= 0 && r1 <= rows && r1 > r0 && c0 >= 0 && c1 <= cols && c1 > c0, `${l.id} region ${r.id} outside grid`);
    }
    if (l.selection) assert.ok(l.selection.window > 0 && l.selection.step > 0 && l.selection.window <= Math.min(rows, cols), `${l.id} selection`);
  }
});

test("every preset region was picked from the data, so the page must treat all of them as data-selected", () => {
  // Fail-closed contract: the page never treats a published preset as a pre-specified test.
  const methods = new Set();
  for (const l of grid) {
    if (!existsSync(join(data, l.regionsDir, "regions.json"))) continue;
    for (const r of json(join(data, l.regionsDir, "regions.json")).regions) methods.add(r.selectionMethod ?? "");
  }
  assert.ok([...methods].every((m) => /score|ranking/i.test(m)), `unrecognised selection wording: ${[...methods].join(" | ")}`);
});

test("published grids, when present, match their study's metadata", () => {
  for (const l of grid) {
    const path = join(data, l.regionsDir, "difference-grid.json");
    if (!existsSync(path)) continue;
    const meta = json(path), regions = json(join(data, l.regionsDir, "regions.json"));
    assert.deepEqual(meta.shape, regions.nativeShape, l.id);
    assert.deepEqual(meta.sourceGranules, regions.sourceGranules, l.id);
    assert.deepEqual(meta.dates, regions.dates, l.id);
    for (const file of Object.values(meta.files)) assert.ok(existsSync(join(data, l.regionsDir, file)), `${l.id} ${file}`);
  }
});
