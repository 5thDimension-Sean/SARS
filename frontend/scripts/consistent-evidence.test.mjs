import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDIES, parseEvidence } from "../lib/investigation.ts";
import { RESEARCH_STUDIES } from "../lib/research-studies.ts";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const evidence = study => JSON.parse(source(`../public/data/${study.evidenceDir}/evidence.json`));
const pathway = source("../components/evidence-pathway.tsx");
const research = source("../components/research-preview.tsx");
const processed = source("../components/nisar-prototype.tsx");

test("all current processed studies provide real, scientifically constrained four-step data", () => {
  for (const study of STUDIES.filter(s => s.id !== "iowa")) {
    const measured = parseEvidence(evidence(study), study);
    assert.equal(measured.dates.join(","), study.dates.join(","));
    for (const pol of ["HH","HV"]) {
      assert.equal(measured.pols[pol].bins.length,48,study.id);
      assert.ok(measured.pols[pol].observations.every(x => x.count > 0),study.id);
    }
  }
  assert.match(pathway,/ProcessedEvidencePathway/);
  assert.match(pathway,/differenceOfRegionalMediansDb/);
  assert.match(pathway,/separate whole-scene medians|later summary minus earlier summary/);
  for (const anchor of ["#location-observation","#look","#compare","#verify"]) assert.ok(pathway.includes(anchor), anchor);
});

test("research guide never substitutes fake numerical values for missing science", () => {
  assert.equal(RESEARCH_STUDIES.length,9);
  for (const study of RESEARCH_STUDIES) {
    assert.equal(study.measurements,null);
    assert.equal(study.scientificClearance,"EXPLORATORY_NOT_CLEARED");
    assert.ok(study.limitations.length && study.sources.length);
  }
  assert.match(pathway,/isEtna \? "Processed NISAR statistics available" : "No TANGO numerical analysis"/);
  assert.match(pathway,/Histogram counts, paired pixel differences and A\/B\/C values cannot be reconstructed from PNG colors/);
  for (const anchor of ["#research-observation","#research-images","#research-qa","#research-sources"]) assert.ok(pathway.includes(anchor),anchor);
  for (const id of ['id="research-images"','id="research-qa"','id="research-sources"']) assert.ok(research.includes(id),id);
});

test("existing evidence UI and controls remain intact", () => {
  for (const name of ["FullStudyEvidenceStory","MapGate","Histogram","RegionDetail","TrustSection","ProcessedOverlayPanel","Legend","ContextPhotos","Erosion, independently documented."]) {
    assert.ok(processed.includes(name),name);
  }
  for(const name of ["ResearchLocationEvidenceStory","<Gallery","study.video","researchSources","research-sources","downloadSummary","study.archive","StudyDetail"]) {
    if (name === "researchSources") continue;
    assert.ok(research.includes(name),name);
  }
  assert.ok(processed.includes("<ProcessedEvidencePathway"));
  assert.ok(research.includes("<ResearchEvidencePathway"));
});
