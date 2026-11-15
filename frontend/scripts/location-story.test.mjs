import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDIES, parseEvidence, fmtSignedDb } from "../lib/investigation.ts";
import { SITE_CONTEXT } from "../lib/location-context.ts";
import { RESEARCH_STUDIES } from "../lib/research-studies.ts";
import hawaii from "../public/data/hawaii-review/hawaii-summary.json" with { type: "json" };
import iowa from "../public/data/iowa-review/iowa-summary.json" with { type: "json" };

const read = p => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));

test("all seven scientific locations have substantive, cautious, specific explanations", () => {
  assert.deepEqual(Object.keys(SITE_CONTEXT).sort(), STUDIES.map(s => s.id).sort());
  for (const study of STUDIES) {
    const info = SITE_CONTEXT[study.id];
    for (const field of ["setting", "canSuggest", "cannotConfirm", "nextEvidence"]) {
      assert.ok(typeof info[field] === "string" && info[field].length >= 65, study.id+" "+field);
    }
    assert.ok(/cannot|does not|do not|is not|not automatically|neither/i.test(info.cannotConfirm), study.id);
    assert.ok(/compare|check|use|cross-check/i.test(info.nextEvidence), study.id);
  }
});

test("full-data stories use published measured whole-scene summaries, never invented statistics", () => {
  for (const id of ["everglades","louisiana","california","rodanthe","amazon"]) {
    const study = STUDIES.find(s => s.id === id);
    const evidence = parseEvidence(read(`${study.evidenceDir}/evidence.json`), study);
    for (const pol of ["HH","HV"]) {
      const ev = evidence.pols[pol];
      assert.ok(ev.observations.every(o => o.count > 0), id);
      assert.ok(Number.isFinite(ev.differenceOfRegionalMediansDb), id);
      assert.equal(ev.observations[1].date, study.dates[1]);
      assert.match(fmtSignedDb(ev.differenceOfRegionalMediansDb), /dB$/);
    }
    assert.ok(/NOT CLEARED|EXPLORATORY/i.test(evidence.scientificClearance), id);
  }
});

test("Hawaii and Iowa are paired-pixel studies but have no fabricated histogram files", () => {
  for (const evidence of [hawaii,iowa]) {
    assert.ok(evidence.commonValidPixels > 10000);
    for (const pol of ["HH","HV"]) {
      const s = evidence.polStats[pol];
      assert.equal(s.pairedPixelCount, evidence.commonValidPixels);
      assert.ok(s.pairedDifferenceP05Db <= s.pairedDifferenceMedianDb);
      assert.ok(s.pairedDifferenceMedianDb <= s.pairedDifferenceP95Db);
    }
    assert.equal(evidence.scientificStatus, "EXPLORATORY_NOT_CLEARED");
    assert.equal("histogramBins" in evidence, false);
  }
});

test("all research locations are provenance-only and must not show invented quantitative data", () => {
  assert.equal(RESEARCH_STUDIES.length, 9);
  for (const research of RESEARCH_STUDIES) {
    assert.equal(research.measurements, null, research.id);
    assert.equal(research.scientificClearance, "EXPLORATORY_NOT_CLEARED");
    assert.ok(research.story && research.limitations.length > 0 && research.sources.length > 0, research.id);
  }
});
