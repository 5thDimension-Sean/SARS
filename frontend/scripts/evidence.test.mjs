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
