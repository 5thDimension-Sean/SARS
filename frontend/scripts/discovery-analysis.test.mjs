import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const source=await readFile(new URL("../lib/discovery-analysis.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {calculateRoiComparison,validateRoiGrid,evaluateEvidence,reportHtml,coordinatesAtPoint,radarSeries}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const raw=JSON.parse(await readFile(new URL("../data/sample-data.json",import.meta.url),"utf8"));
const p=raw.phenomena[0],location=p.locations[0];
const before=location.acquisitions[0],after=location.acquisitions.at(-1);
function grid(acquisition,change=0,pol="HV"){
  return {schemaVersion:"1.0",type:"gamma0-db",width:8,height:8,pol,date:acquisition.date,values:Array.from({length:64},(_,i)=>i===0?null:-18+change)};
}
test("strict grid contract rejects mismatch and unsafe numbers",()=>{
  assert.equal(validateRoiGrid(grid(before),before,"HV").width,8);
  assert.throws(()=>validateRoiGrid(grid(before),after,"HV"),/metadata/);
  assert.throws(()=>validateRoiGrid({...grid(before),values:[0]},before,"HV"),/sample count/);
  assert.throws(()=>validateRoiGrid({...grid(before),values:[Infinity,...Array(63).fill(-15)]},before,"HV"),/Invalid/);
});
test("ROI mean uses matched valid pixels with null mask, no fake area",()=>{
  const a=validateRoiGrid(grid(before),before,"HV"),b=validateRoiGrid(grid(after,2),after,"HV");
  const result=calculateRoiComparison(a,b,{x:.5,y:.5},3);
  assert.ok(result);assert.ok(Math.abs(result.delta-2)<0.001);
  assert.ok(result.pairs<=result.total);assert.equal(result.beforeMean,-18);
  assert.equal(calculateRoiComparison(a,{...b,pol:"HH"},{x:.5,y:.5}),null);
  assert.equal(calculateRoiComparison({...a,values:Array(64).fill(null)},b,{x:.5,y:.5}),null);
});
test("sample scenes cannot pass observed or derived evidence requirements",()=>{
  const checks=evaluateEvidence(location,before,after,"HV");
  assert.equal(checks[0].passed,false);
  assert.equal(checks[4].passed,false);
  assert.equal(checks[5].passed,false);
});
test("meridian coordinates reflect north-up Web Mercator map pixel",()=>{
  const place={...location,bounds:[-81,24,-80,26]};
  assert.match(coordinatesAtPoint(place,{x:0,y:0}),/26.00000°/);
  assert.match(coordinatesAtPoint(place,{x:1,y:1}),/24.00000°/);
});
test("report must encode injected markup instead of executing it",()=>{
  const report=reportHtml("<script>alert(1)</script>","x <img src=x>");
  assert.doesNotMatch(report,/<script>|<img src=x>/);
  assert.match(report,/&lt;script&gt;/);
});
test("series is explicit for missing real aggregate values",()=>{
  const series=radarSeries(location,"HV");assert.equal(series.length,location.acquisitions.length);
  assert.ok(series.every(x=>x.date));
});
