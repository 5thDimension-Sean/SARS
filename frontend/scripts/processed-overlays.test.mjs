import test from "node:test";
import assert from "node:assert/strict";
import { parseProcessedOverlays, loadProcessedOverlays } from "../lib/processed-overlays.ts";

// Synthetic contract fixture only; never published as NASA observations.
function fixture() {
  const lat = y => (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI;
  return {
    schemaVersion: "1.0", provenance: "derived", source: "Synthetic test source", dryRun: false,
    processingNotes: ["Synthetic test mask note"], dbRanges: { HH: [-25, 0], HV: [-30, -5] },
    frames: [{ id: "test", label: "Test frame", crs: "EPSG:4326", overlayCrs: "EPSG:3857",
      bounds: [0, 0, 100 / 6378137 * 180 / Math.PI, lat(100)],
      overlaySize: [10, 10], overlayTransform: [10, 0, 0, 0, -10, 100],
      acquisitions: [{ date: "2026-09-30T00:00:00Z", productType: "GCOV", sourceFile: "synthetic.h5",
        productVersion: "test-version", compositeReleaseId: "test-release", dataMaturity: "UNKNOWN",
        overlays: { HH: "test/HH.png", HV: "test/HV.png" } }],
    }],
  };
}
const parse = value => parseProcessedOverlays(value, "https://example.test/SARS/data/");
test("georeferenced previews retain corner order, fixed scales and source provenance", () => {
  const data = fixture(), [hh, hv] = parse(data);
  const [w, s, e, n] = data.frames[0].bounds;
  assert.deepEqual(hh.coordinates, [[w,n], [e,n], [e,s], [w,s]]);
  assert.equal(hh.url, "https://example.test/SARS/data/test/HH.png");
  assert.equal(hh.source, data.source);
  assert.equal(hh.sourceFile, "synthetic.h5");
  assert.equal(hh.version, "test-version / test-release");
  assert.equal(hh.maturity, "UNKNOWN");
  assert.equal(hh.date, "2026-09-30T00:00:00Z");
  assert.deepEqual(hv.range, [-30,-5]);
  assert.deepEqual(hh.notes, data.processingNotes);
});
test("absent QA stays UNVERIFIED; supplied statuses and caveats are preserved", () => {
  assert.equal(parse(fixture())[0].qa.status, "UNVERIFIED");
  for (const status of ["PASS", "FAIL", "UNVERIFIED"]) {
    const data = fixture();
    data.frames[0].acquisitions[0].qa = { status, summary: "Manual review caveat" };
    assert.deepEqual(parse(data)[0].qa, { status, summary: "Manual review caveat" });
  }
  const data = fixture();
  data.frames[0].acquisitions[0].qa = { status: "APPROVED", summary: "invalid" };
  assert.throws(() => parse(data));
});
test("missing, fictional, dry-run and invalid metadata cannot become real previews", () => {
  for (const value of [null, {}, { ...fixture(), provenance: "sample" }, { ...fixture(), dryRun: true }]) assert.throws(() => parse(value));
  for (const mutate of [
    d => { delete d.source; },
    d => { d.frames[0].acquisitions[0].date = "not-a-date"; },
    d => { delete d.frames[0].acquisitions[0].sourceFile; },
    d => { d.dbRanges.HH = [0, -25]; },
    d => { d.frames[0].acquisitions.push(structuredClone(d.frames[0].acquisitions[0])); },
  ]) { const data = fixture(); mutate(data); assert.throws(() => parse(data)); }
  assert.deepEqual(parse({ ...fixture(), frames: [] }), []);
});
test("misaligned, rotated, nonfinite and unsupported grids are rejected", () => {
  for (const mutate of [
    f => { f.bounds[2] += 0.01; }, f => { f.overlayTransform[1] = 1; },
    f => { f.overlayTransform[4] = 10; }, f => { f.bounds[0] = NaN; },
    f => { f.overlayCrs = "EPSG:32617"; }, f => { f.overlaySize[0] = 0; },
  ]) { const data = fixture(); mutate(data.frames[0]); assert.throws(() => parse(data)); }
});
test("remote, traversal, query and executable asset paths are rejected", () => {
  for (const path of ["https://example.test/a.png", "//example.test/a.png", "../a.png", "a/../../b.png", "a.png?token=secret", "a%2fb.png", "a.svg", "javascript:alert(1)", "a\\b.png"]) {
    const data = fixture(); data.frames[0].acquisitions[0].overlays.HH = path;
    assert.throws(() => parse(data));
  }
});
test("loader preserves deployment prefix, omits credentials and refuses redirects", async t => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://example.test/SARS/data/manifest.json");
    assert.deepEqual(options, { signal, credentials: "omit", redirect: "error" });
    return Response.json(fixture());
  });
  const result = await loadProcessedOverlays("https://example.test/SARS/data/manifest.json", signal);
  assert.equal(result[0].url, "https://example.test/SARS/data/test/HH.png");
});
test("404 is missing data; server failures, malformed JSON, and invalid manifests are errors", async t => {
  const mock = t.mock.method(globalThis, "fetch");
  const run = () => loadProcessedOverlays("https://example.test/data/manifest.json", new AbortController().signal);
  mock.mock.mockImplementation(async () => new Response(null, { status: 404 }));
  assert.equal(await run(), null);
  for (const response of [new Response(null, { status: 500 }), new Response("not JSON"), Response.json({})]) {
    mock.mock.mockImplementation(async () => response);
    await assert.rejects(run);
  }
  mock.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  await assert.rejects(run, { name: "AbortError" });
});
