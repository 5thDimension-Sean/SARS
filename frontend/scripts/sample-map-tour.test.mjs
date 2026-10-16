import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";

const source=await readFile(new URL("../lib/sample-map-tour.ts",import.meta.url),"utf8");
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {mapTourSteps,TOUR_INTERVAL_MS}=await import("data:text/javascript;base64,"+Buffer.from(javascript).toString("base64"));

test("map walkthrough includes ten distinct ordered 15-second stops",()=>{
  assert.equal(TOUR_INTERVAL_MS,15000);
  assert.equal(mapTourSteps.length,10);
  assert.deepEqual(mapTourSteps.map(s=>s.id),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(mapTourSteps.map(s=>s.shortLabel)).size,10);
  assert.equal(TOUR_INTERVAL_MS*mapTourSteps.length,150000);
});

test("every stop is clearly educational and navigable",()=>{
  for(const stop of mapTourSteps){
    assert.ok(stop.title.length>9);
    assert.ok(stop.description.length>75);
    assert.ok(stop.tags.length>=2);
    assert.ok(stop.insight.length>10);
    assert.ok(stop.point.length===2&&stop.point.every(Number.isFinite));
    assert.ok(Math.abs(stop.turn)<=20);
    assert.ok(stop.focus);
  }
  assert.ok(mapTourSteps.some(s=>s.description.toLowerCase().includes("fictional")));
  assert.ok(mapTourSteps.some(s=>s.description.toLowerCase().includes("provenance")||s.description.toLowerCase().includes("processing")));
});
