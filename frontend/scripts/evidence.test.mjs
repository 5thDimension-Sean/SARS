import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceRows, investigationReport } from '../lib/evidence.ts';
import { zoomAt } from '../lib/viewport-geometry.ts';
const sample = { mode: 'sample', label: 'Test <script>alert(1)</script>', before: '2026-09-30', after: '2026-09-30', polarization: 'HV', source: '<img src=x onerror=alert(1)>', versionsMatch: true, numericAvailable: false, notes: ['<svg onload=alert(1)>'] };
test('sample and same-date checks never imply measured results or scientific clearance', () => {
  const rows = evidenceRows(sample);
  assert.equal(rows.find(r => r.label === 'Measured source').status, 'MISSING');
  assert.equal(rows.find(r => r.label === 'Distinct acquisitions').status, 'MISSING');
  assert.equal(rows.find(r => r.label === 'Processing agreement').status, 'UNVERIFIED');
  assert.equal(rows.find(r => r.label === 'Independent verification').status, 'UNVERIFIED');
  const derived = evidenceRows({ ...sample, mode: 'derived', numericAvailable: true });
  assert.equal(derived.find(r => r.label === 'Official QA and artifacts').status, 'UNVERIFIED');
});
test('downloaded report escapes all untrusted text and retains sample and QA limitations', () => {
  const html = investigationReport(sample);
  assert.doesNotMatch(html, /<script>|<img|<svg/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /FICTIONAL SAMPLE/);
  assert.match(html, /NOT CLEARED/);
  assert.match(html, /not scientific confidence/);
});
test('pointer zoom preserves the anchored content point and obeys bounds', () => {
  const camera = { zoom: 1.2, x: 34, y: -12 }, point = { x: 150, y: 80 };
  const next = zoomAt(camera, 2.5, point.x, point.y);
  assert.ok(Math.abs((point.x - next.x) / next.zoom - (point.x - camera.x) / camera.zoom) < 1e-10);
  assert.ok(Math.abs((point.y - next.y) / next.zoom - (point.y - camera.y) / camera.zoom) < 1e-10);
  assert.equal(zoomAt(camera, 100, 0, 0).zoom, 3);
  assert.equal(zoomAt(camera, .01, 0, 0).zoom, 1);
});

test('pointer-anchored zoom reverses at the same cursor position', () => {
  const camera = { zoom: 1, x: 0, y: 0 }, point = { x: 220, y: -130 };
  const zoomed = zoomAt(camera, 2, point.x, point.y);
  const restored = zoomAt(zoomed, 1, point.x, point.y);
  assert.equal(restored.zoom, camera.zoom);
  assert.ok(Math.abs(restored.x) < 1e-10);
  assert.ok(Math.abs(restored.y) < 1e-10);
});

test('place report escapes every string, keeps failed checks visible, and never claims a cause', async () => {
  const { placeReportHtml, reportFileName } = await import('../lib/place-report.ts');
  const html = placeReportHtml({
    title: 'Bad <script>alert(1)</script> place', dates: ['2026-09-30', '2026-10-12'], polarizations: ['HH', 'HV'], granules: ['G1-ASF', 'G2"><img src=x>'],
    source: '<b>src</b>', status: 'EXPLORATORY_NOT_CLEARED',
    tables: [{ caption: 'Cap <i>', head: ['Stat', '<th>'], rows: [['Median', '-14.8 <dB>']] }],
    checks: [{ label: 'Official QA', state: 'FAIL', text: 'noise <svg onload=x>' }, { label: 'Dates', state: 'PASS', text: 'ok' }],
    limitations: ['<iframe>'], generated: '2026-11-15',
  });
  assert.doesNotMatch(html, /<script>alert|<img src=x|<svg onload|<iframe|<b>src/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /class="fail"[^>]*><th[^>]*>Official QA/);
  assert.match(html, /do not establish flooding/);
  assert.match(html, /not affiliated with NASA/);
  assert.equal(reportFileName('Big Sur, California', ['2026-08-22', '2026-09-15']), 'tango-big-sur-california-2026-08-22-2026-09-15.html');
  assert.match(reportFileName('../../etc/passwd', ['a', 'b']), /^tango-[a-z0-9-]+-a-b\.html$/);
});
