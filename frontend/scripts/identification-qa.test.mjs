import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUDIES, qaState } from '../lib/investigation.ts';
import { IDENTIFICATION_QA, IDENTIFICATION_LIMITS } from '../lib/identification-qa.ts';
import { evidenceRows, investigationReport } from '../lib/evidence.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const audit = JSON.parse(read('public/data/identification-qa-audit.json'));

test('every registered pair has exact source-backed identification failures, with no blocked studies published', () => {
  assert.deepEqual(STUDIES.map(s => s.id), ['everglades', 'louisiana', 'california', 'hawaii', 'iowa', 'palm']);
  assert.equal(audit.products.length, 12);
  for (const study of STUDIES) for (const [index, id] of study.granules.entries()) {
    const product = audit.products.find(p => p.conceptId === id);
    assert.ok(product, `${study.id}: missing audited acquisition`);
    assert.equal(product.identification.zeroDopplerStartTime.value.slice(0, 10), study.dates[index]);
    assert.equal(product.identification.instrumentName.value, 'LSAR');
    assert.deepEqual(product.identification.listOfObservationModes.value, ['(NOT SPECIFIED)']);
    assert.equal(product.reproducedChecks.instrumentNameAllowedValue, false);
    assert.deepEqual(product.reproducedChecks.observationModeFormat, [false]);
    assert.ok(product.officialQARows.some(row => row.Check.includes('identification') && row.Result === 'FAIL'));
  }
});

test('known failures cannot disappear from any downloadable study data or become unverified', () => {
  for (const study of STUDIES) {
    const original = ['everglades', 'louisiana', 'california'].includes(study.id);
    const data = JSON.parse(read(`public/data/${study.evidenceDir}/${original ? 'evidence.json' : `${study.id}-summary.json`}`));
    const notice = original ? data.quality.identificationGroup : data.identificationQa;
    assert.equal(notice, `${IDENTIFICATION_QA} ${IDENTIFICATION_LIMITS}`, study.id);
    assert.equal(qaState(notice), 'fail');
    assert.match(notice, /instrumentName is LSAR/);
    assert.match(notice, /L-SAR or S-SAR/);
    assert.match(notice, /listOfObservationModes contains \(NOT SPECIFIED\)/);
    assert.match(notice, /not necessarily the only official QA failures/);
    assert.match(notice, /do not independently establish invalid radar pixels or incorrect geolocation/);
    assert.match(notice, /scientific clearance.*remain unresolved/);
    assert.match(notice, /Unverified checks remain unverified/);
  }
});

test('each comparison viewer renders the shared disclosure and exposes downloadable audit evidence', () => {
  for (const name of ['nisar-prototype', 'hawaii-study', 'iowa-study', 'palm-study']) {
    assert.match(read(`components/${name}.tsx`), /<IdentificationQa \/>/, name);
  }
  const component = read('components/identification-qa.tsx');
  assert.match(component, /IDENTIFICATION_QA/);
  assert.match(component, /IDENTIFICATION_LIMITS/);
  assert.match(component, /dataUrl\("identification-qa-audit.json"\)/);
  assert.match(component, /download/);
  assert.match(read('components/story-map.tsx'), /not scientifically cleared; official identification QA failed/);
  assert.match(read('components/investigation/radar-hero.tsx'), /scientific clearance remains unresolved/);
});

test('unrelated or fictional reports do not inherit known failures from the six-study audit', () => {
  const input = { mode: 'sample', label: 'Sample', before: '2026-09-30', after: '2026-10-12', polarization: 'HH', source: 'Fictional', versionsMatch: false, numericAvailable: false, notes: [] };
  assert.equal(evidenceRows(input).find(r => r.label === 'Official QA and artifacts').status, 'UNVERIFIED');
  assert.doesNotMatch(investigationReport(input), /instrumentName|listOfObservationModes/);
  assert.match(investigationReport(input), /FICTIONAL SAMPLE/);
});

// Baseline payload hashes from six-study commit 0cf569d, excluding only the disclosure field.
import { createHash } from 'node:crypto';
const preservedPayloads = {
  "public/data/everglades-evidence/evidence.json": "6f96f41f84a1a93f7d82ad54235ad9c017b1608d5faf0f0fb7e23ecc9de8c608",
  "public/data/louisiana-evidence/evidence.json": "b4719c71747e9318bc20670b951702e3df5d6b192a6e28a3cd7e953f4fb8bd31",
  "public/data/california-evidence/evidence.json": "c49d4e6d6f01ebaebfdbcd09ae61d9bc0226feb04e21fc0043f4a829c171ea18",
  "public/data/hawaii-review/hawaii-summary.json": "7d7eef7023a5f16e4ccd3bc72e94d6d3d8300da125456ac7f34c315131953d4b",
  "public/data/iowa-review/iowa-summary.json": "3aac80bee2b7b08c5127cc4a56c55ab5e431ce07e89bd22aceb147606be69042",
  "public/data/palm-review/palm-summary.json": "f392008be0c8b2d8f25256008777f0f37024de52afb34a9b5b24287e60621714"
};
test('QA edits preserve all other source values, statuses and provenance exactly', () => {
  for (const [path, hash] of Object.entries(preservedPayloads)) {
    const data = JSON.parse(read(path));
    if (data.quality) delete data.quality.identificationGroup;
    else delete data.identificationQa;
    assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'), hash, path);
  }
});
