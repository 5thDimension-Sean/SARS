import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, safeAsset, loadManifest } from '../lib/processed-data.ts';
const acquisition = (date) => ({ date, productType: 'GCOV', productVersion: '1.0', compositeReleaseId: 'TEST', dataMaturity: 'UNKNOWN', sourceFile: 'SYNTHETIC.h5', orbit: 1, pols: ['HV'], overlays: { HV: 'T001/after_HV.png' }, cog: {}, statisticsDb: { HV: { mean: -10, min: -12, max: -8, validPixels: 4 } }, histogramDb: { HV: { binEdges: [-30, -15, 0], counts: [1, 3], normalized: [.25, .75] } } });
const fixture = () => ({ schemaVersion: '1.0', provenance: 'derived', source: 'SYNTHETIC TEST ONLY', generated: '2026-11-07T00:00:00Z', dbRanges: { HV: [-30, -5] }, processingNotes: ['Synthetic software test; never NASA observations'], frames: [{ id: 'TEST', label: 'Synthetic test frame', track: 1, frame: 1, passDirection: 'ASCENDING', crs: 'EPSG:4326', overlayCrs: 'EPSG:3857', overlayTransform: [1, 0, 0, 0, -1, 0], bounds: [-81, 25, -80, 26], overlaySize: [64, 64], acquisitions: [acquisition('2026-09-30T00:00:00Z'), acquisition('2026-10-12T00:00:00Z')] }] });
test('processed contract accepts pipeline field names, statistics and unknown maturity honestly', () => {
  const m = parseManifest(fixture());
  assert.equal(m.frames[0].acquisitions[0].statisticsDb.HV.validPixelCount, 4);
  assert.equal(m.frames[0].acquisitions[0].dataMaturity, 'UNKNOWN');
  assert.equal(m.frames[0].acquisitions[0].histogramDb.HV.edges.length, 3);
});
test('rejects missing data, wrong product, duplicate dates, unsafe assets and invalid geometry', () => {
  for (const mutate of [
    m => { m.provenance = 'sample'; }, m => { m.dryRun = true; },
    m => { m.frames[0].bounds = [10, 20, -10, 21]; },
    m => { m.frames[0].acquisitions[1].date = m.frames[0].acquisitions[0].date; },
    m => { m.frames[0].acquisitions[0].productType = 'GUNW'; },
    m => { delete m.frames[0].acquisitions[0].overlays.HV; },
    m => { m.frames[0].acquisitions[0].overlays.HV = 'https://evil.test/x.png'; },
    m => { m.frames[0].acquisitions[0].statisticsDb.HV.mean = NaN; },
    m => { m.frames[0].acquisitions[0].histogramDb.HV.normalized = [2]; },
    m => { m.frames[0].acquisitions[0].statisticsDb.HV.validPixels = 1; },
  ]) { const m = fixture(); mutate(m); assert.throws(() => parseManifest(m)); }
  for (const path of ['../secret.png', '/secret.png', 'javascript:alert(1)', 'T/%2e%2e/a.png', 'T/a.png?key=x', 'T/../../a.png']) assert.throws(() => safeAsset(path));
});
test('all masked acquisition has null statistics and no invented values', () => {
  const m = fixture(); m.frames[0].acquisitions[0].statisticsDb.HV = { mean: null, min: null, max: null, validPixels: 0 };
  m.frames[0].acquisitions[0].histogramDb.HV = { binEdges: [-30, -15, 0], counts: [0, 0], normalized: [0, 0] };
  assert.equal(parseManifest(m).frames[0].acquisitions[0].statisticsDb.HV.mean, null);
});
test('missing manifest is an empty state; HTTP and malformed data are errors', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 404 });
    assert.equal(await loadManifest('/data/manifest.json', new AbortController().signal), null);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(loadManifest('/data/manifest.json', new AbortController().signal));
    globalThis.fetch = async () => Response.json({ provenance: 'sample' });
    await assert.rejects(loadManifest('/data/manifest.json', new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
