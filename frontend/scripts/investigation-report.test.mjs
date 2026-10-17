import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const source=await readFile(new URL("../lib/investigation-report.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildInvestigationSnapshot}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const dataset=JSON.parse(await readFile(new URL("../data/sample-data.json",import.meta.url),"utf8"));
const p=dataset.phenomena.find(item=>item.id==="wetland");
const loc=p.locations[0], first=loc.acquisitions[0], last=loc.acquisitions.at(-1);

test("fictional sample values and events are never claimed as observed evidence",()=>{
  const result=buildInvestigationSnapshot({phenomenon:p,location:loc,before:first,after:last,polarization:"HV"});
  assert.equal(result.provenance,"SAMPLE");
  assert.match(result.evidenceTitle,/Demonstration/);
  assert.match(result.evidenceDetail,/No real surface change/);
  assert.match(result.howDetail,/not measured NISAR/);
  assert.match(result.report,/SAMPLE DEMONSTRATION — NOT AN OBSERVATION/);
  assert.match(result.report,/Everglades/);
  assert.match(result.report,/25.6153/);
  assert.equal(result.changeOverlayAvailable,false);
  assert.doesNotMatch(result.report,/10.9 km²/);
});

test("same date explicitly prevents any comparison claim",()=>{
  const result=buildInvestigationSnapshot({phenomenon:p,location:loc,before:last,after:last,polarization:"HH"});
  assert.equal(result.twoDates,false);
  assert.match(result.howTitle,/Choose/);
  assert.match(result.howDetail,/same acquisition/);
});

function derivedScenario(){
  const acquisitions=loc.acquisitions.map(a=>({...a,provenance:"derived",source:"NISAR sample-test fixture",productVersion:"V1"}));
  return { ...loc,provenance:"derived",
    processingNotes:["WARN: calibration maturity needs independent review"],
    changeLayers:[{type:"dbDiff",pol:"HV",from:acquisitions[0].date,to:acquisitions.at(-1).date,url:"/data/test-diff.png"}],
    acquisitions
  };
}

test("derived evidence requires an exact acquisition and polarization match",()=>{
  const location=derivedScenario(), before=location.acquisitions[0], after=location.acquisitions.at(-1);
  const selected=buildInvestigationSnapshot({phenomenon:p,location,before,after,polarization:"HV"});
  assert.equal(selected.provenance,"DERIVED GCOV");
  assert.equal(selected.changeOverlayAvailable,true);
  assert.match(selected.howDetail,/difference overlay is available/);
  assert.match(selected.evidenceDetail,/does not by itself establish flooding/);
  assert.match(selected.report,/Processing warnings/);
  assert.match(selected.report,/CAUSE NOT VALIDATED/);
  const mismatch=buildInvestigationSnapshot({phenomenon:p,location,before,after,polarization:"HH"});
  assert.equal(mismatch.changeOverlayAvailable,false);
  assert.match(mismatch.howDetail,/no matched difference overlay/);
  const pairMismatch=buildInvestigationSnapshot({phenomenon:p,location,before:location.acquisitions[1],after,polarization:"HV"});
  assert.equal(pairMismatch.changeOverlayAvailable,false);
});

test("derived single acquisition is not change evidence",()=>{
  const location=derivedScenario();
  const result=buildInvestigationSnapshot({phenomenon:p,location,before:location.acquisitions[0],after:location.acquisitions[0],polarization:"HV"});
  assert.equal(result.twoDates,false);
  assert.equal(result.changeOverlayAvailable,false);
  assert.match(result.howDetail,/no temporal change/);
});
