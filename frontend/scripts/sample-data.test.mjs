import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const data = JSON.parse(
  readFileSync(new URL("../data/sample-data.json", import.meta.url), "utf8"),
);
test("sample manifest is finite, swappable, and transparently attributed", () => {
  assert.equal(data.provenance, "sample");
  assert.equal(data.phenomena.length, 3);
  for (const p of data.phenomena)
    for (const l of p.locations) {
      assert.ok(Math.abs(l.coordinates.latitude) <= 90);
      assert.ok(Math.abs(l.coordinates.longitude) <= 180);
      assert.match(l.coordinateSource, /^https:\/\//);
      for (const a of l.acquisitions) {
        assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(a.frame >= 1 && a.frame <= 176);
        assert.equal(a.tileUrl, null);
        assert.ok(Object.values(a.layerUrls).every((u) => u === null));
        for (const m of a.metrics) {
          assert.equal(m.provenance, "sample");
          assert.ok(Number.isFinite(m.value));
        }
      }
    }
});
test("acquisitions are ordered with nominal repeats and deliberate gaps", () => {
  for (const p of data.phenomena)
    for (const l of p.locations) {
      const gaps = l.acquisitions
        .slice(1)
        .map(
          (a, i) =>
            (Date.parse(a.date) - Date.parse(l.acquisitions[i].date)) /
            86400000,
        );
      assert.ok(gaps.every((d) => d === 12 || d === 24));
      assert.equal(gaps.filter((d) => d > 12).length, 1);
      assert.ok(
        l.events.every((e) => l.acquisitions.some((a) => a.date === e.date)),
      );
    }
});
test("backscatter histogram pairs share bins and normalize to 100 percent", () => {
  for (const p of data.phenomena.filter((p) => p.analysis === "backscatter"))
    for (const l of p.locations)
      for (const a of l.acquisitions) {
        assert.equal(a.productType, "GCOV");
        assert.equal(a.displacementProfileCm.length, 0);
        assert.deepEqual(
          a.histogramBinsDb.map((b) => b.db),
          l.acquisitions[0].histogramBinsDb.map((b) => b.db),
        );
        for (const pol of a.polarization) {
          assert.ok(
            Math.abs(a.histogramBinsDb.reduce((s, b) => s + b[pol], 0) - 100) <
              0.02,
          );
          assert.ok(a.histogramBinsDb.every((b) => b[pol] >= 0));
        }
      }
});
test("displacement references the first pass with truthful profile metrics", () => {
  for (const p of data.phenomena.filter((p) => p.analysis === "displacement"))
    for (const l of p.locations)
      for (const a of l.acquisitions) {
        assert.equal(a.productType, "GUNW");
        assert.equal(a.histogramBinsDb.length, 0);
        assert.equal(a.referenceDate, l.acquisitions[0].date);
        assert.equal(a.displacementSign, "positive_toward_sensor");
        const peak = +Math.max(
          ...a.displacementProfileCm.map((pt) => Math.abs(pt.displacementCm)),
        ).toFixed(1);
        assert.equal(a.metrics[0].value, peak);
      }
});
