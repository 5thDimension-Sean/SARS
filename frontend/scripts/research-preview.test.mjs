import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STUDIES } from "../lib/investigation.ts";
import {
  RESEARCH_CATALOG, RESEARCH_STUDIES, validateResearchCatalog, researchIdFromHash,
  researchMediaUrl, researchSummary, safeResearchSource,
} from "../lib/research-studies.ts";

const clone = () => structuredClone(RESEARCH_CATALOG);
const study = id => RESEARCH_STUDIES.find(s => s.id === id);

test("research extension contains all nine locations and switches Hubbard to the event-spanning dates", () => {
  assert.deepEqual(RESEARCH_STUDIES.map(s => s.id), ["hubbard", "sossusvlei", "kamchatka", "mozambique", "sri-lanka", "antarctica", "etna", "sumatra", "queensland"]);
  assert.deepEqual(study("hubbard").observationDates, ["2025-11-26", "2025-12-08"]);
  assert.deepEqual(study("hubbard").media.map(m => m.date), ["2025-11-26", "2025-12-08"]);
  assert.deepEqual(study("hubbard").archive.dates, ["2026-10-04", "2026-10-16"]);
  assert.deepEqual(study("mozambique").observationDates, ["2026-01-05", "2026-01-17"]);
  assert.equal(study("kamchatka").gallery, "sequence");
  assert.ok(study("kamchatka").video.src.endsWith("nisar_volcano_annotated.mp4"));
  assert.deepEqual(RESEARCH_STUDIES.filter(s => STUDIES.some(verified => verified.id === s.id)).map(s => s.id), ["etna"], "Etna alone is newly promoted from publisher-only research to independently processed real-data study");
});

test("candidates and mixed-sensor or single-scene sources never imply measured NISAR temporal pairs", () => {
  for (const id of ["sumatra", "queensland"]) {
    assert.equal(study(id).evidence, "candidate");
    assert.deepEqual(study(id).observationDates, []);
    assert.deepEqual(study(id).media, []);
    assert.equal(study(id).gallery, "pending");
  }
  for (const id of ["sri-lanka", "antarctica"]) {
    assert.equal(study(id).evidence, "published-scene");
    assert.deepEqual(study(id).observationDates, []);
    assert.equal(study(id).media[0].defer, true);
  }
  assert.match(study("sri-lanka").limitations.join(" "), /two sensors/);
  assert.match(study("antarctica").limitations.join(" "), /not a before\/after/);
});

test("Etna's catalog pair spans the August episode while missing flood-event pairs remain unavailable", () => {
  const audit = JSON.parse(readFileSync(new URL("../../pipeline/research/event-pairs/source-index.json", import.meta.url), "utf8"));
  const etna = study("etna");
  assert.equal(etna.evidence, "official-browse");
  assert.deepEqual(etna.observationDates, ["2026-07-23", "2026-08-16"]);
  assert.equal(etna.gallery, "polarization-pair");
  assert.ok(etna.observationDates[0] < audit.etna.eventDate && etna.observationDates[1] > audit.etna.eventDate);
  const [before, after] = audit.etna.acquisitions;
  assert.deepEqual(before.collection, after.collection);
  assert.deepEqual(before.pge, after.pge);
  for (const key of audit.etna.matchedAttributes) assert.deepEqual(before.attributes[key], after.attributes[key]);
  assert.equal(audit.etna.repeatIntervalDays, (Date.parse(etna.observationDates[1]) - Date.parse(etna.observationDates[0])) / 86400000);
  for (const a of audit.etna.acquisitions) for (const m of a.browse) {
    const bytes = readFileSync(new URL("../../" + m.path, import.meta.url));
    assert.equal(createHash("md5").update(bytes).digest("hex"), m.md5);
    assert.equal(a.qa.verified, false);
    assert.equal(a.hdf5.downloaded, false);
  }
  assert.ok(audit.queries.every(q => q.status === 200 && q.complete && q.hits === q.returned));
  assert.equal(audit.sumatra.result, "NO_EVENT_PAIR_FOUND");
  assert.equal(audit.queensland.result, "NO_PROCESSED_EVENT_SPANNING_PAIR_FOUND");
  assert.match(study("queensland").limitations.join(" "), /both dates precede/);
  assert.match(study("sumatra").limitations.join(" "), /Landsat 9/);
});

test("local media matches recorded provenance and complete date/polarization coverage", () => {
  const provenance = JSON.parse(readFileSync(new URL("../public/research-media/local-assets.json", import.meta.url), "utf8"));
  const paths = new Set();
  for (const s of RESEARCH_STUDIES) for (const m of [...s.media, ...(s.video ? [s.video] : [])]) {
    assert.ok(m.src.startsWith("/research-media/"), "All preview media must be archived locally");
    paths.add(m.src);
    const record = provenance.assets.find(a => "/" + a.path === m.src);
    assert.ok(record, m.src);
    const bytes = readFileSync(new URL("../public" + m.src, import.meta.url));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256);
    assert.match(record.sourceUrl, /^https:\/\//);
    if (m.src.endsWith(".png")) assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    else if (m.src.endsWith(".gif")) assert.match(bytes.subarray(0, 6).toString(), /^GIF8[79]a$/);
    else if (m.src.endsWith(".mp4")) assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    else assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  }
  assert.equal(paths.size, provenance.assets.length);
  const sossus = study("sossusvlei");
  for (const d of sossus.observationDates) for (const pol of ["HH", "HV"]) {
    assert.equal(sossus.media.filter(m => m.date === d && m.polarization === pol).length, 1);
  }
});

test("status upgrades, invented statistics and malformed or mismatched observations are rejected", () => {
  for (const mutate of [
    c => { c.scientificClearance = "CLEARED"; },
    c => { c.studies[0].status = "PASS"; },
    c => { c.studies[0].measurements = { areaKm2: 100 }; },
    c => { c.studies[0].differenceDb = 10; },
    c => { c.studies[0].observationDates[0] = "2025-02-30"; },
    c => { c.studies[0].media[1].date = "2026-10-16"; },
    c => { c.studies[0].media.pop(); },
    c => { c.studies[0].id = c.studies[1].id; },
    c => { c.studies[1].media[0].polarization = "VV"; },
    c => { c.studies[6].observationDates = ["2026-01-01"]; },
    c => { c.studies[6].media = c.studies[0].media; },
  ]) {
    const c = clone(); mutate(c); assert.throws(() => validateResearchCatalog(c));
  }
});

test("external links and media refuse untrusted hosts, credentials, traversal and token query strings", () => {
  for (const bad of ["javascript:alert(1)", "http://science.nasa.gov/x", "https://science.nasa.gov.evil.example/x",
    "https://me:secret@science.nasa.gov/x", "https://science.nasa.gov/x?token=secret", "https://science.nasa.gov:8443/x"]) {
    assert.equal(safeResearchSource(bad), false);
    const c = clone(); c.studies[0].sources[0].url = bad; assert.throws(() => validateResearchCatalog(c));
  }
  for (const bad of ["/research-media/../private.png", "/research-media/a.svg", "https://evil.example/radar.png"]) {
    assert.throws(() => researchMediaUrl(bad));
  }
});

test("research routing, deployment prefixes and downloadable summaries preserve scientific limits", () => {
  assert.equal(researchIdFromHash("#hubbard"), "hubbard");
  assert.equal(researchIdFromHash("#queensland"), "queensland");
  assert.equal(researchIdFromHash("#unknown"), "hubbard");
  assert.equal(researchMediaUrl("/research-media/a.png", "/SARS/"), "/SARS/research-media/a.png");
  assert.equal(researchMediaUrl("/research-media/sri-lanka/Ditwah.gif", "/SARS"), "/SARS/research-media/sri-lanka/Ditwah.gif");
  assert.equal(researchMediaUrl(study("kamchatka").video.src, "/SARS"), "/SARS" + study("kamchatka").video.src);
  const remote = study("mozambique").media[0].sourceUrl;
  assert.equal(researchMediaUrl(remote, "/SARS"), remote);
  for (const s of RESEARCH_STUDIES) {
    const report = researchSummary(s);
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.scientificClearance, "EXPLORATORY_NOT_CLEARED");
    assert.equal(report.quantitativeDifferenceAvailable, false);
    assert.equal(report.measurements, null);
    assert.deepEqual(report.limitations, s.limitations);
  }
  const page = readFileSync(new URL("../app/research-preview/page.tsx", import.meta.url), "utf8");
  assert.match(page, /index: false, follow: false/);
});
