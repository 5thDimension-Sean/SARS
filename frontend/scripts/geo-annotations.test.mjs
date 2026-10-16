import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const raw=await readFile(new URL("../lib/geo-annotations.ts",import.meta.url),"utf8");
const js=ts.transpileModule(raw,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {loadAnnotations,rectangleRing,distanceKm,areaKm2,annotationGeoJSON}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
test("geographic annotations reject invalid untrusted storage",()=>{
  assert.deepEqual(loadAnnotations('{"bad":1}'),[]);
  assert.deepEqual(loadAnnotations('[{"id":"x","kind":"point","points":[[210,40]],"label":"bad"}]'),[]);
  assert.equal(loadAnnotations('[{"id":"a","kind":"point","points":[[-80.7,25.6]],"label":"note"}]').length,1);
});
test("measurement utilities produce finite geographic values",()=>{
  assert.equal(distanceKm([[-80,25],[-80,25]]),0);
  assert.ok(distanceKm([[0,0],[0,1]])>110);
  assert.ok(areaKm2([[0,0],[1,0],[1,1],[0,1]])>12000);
  assert.deepEqual(rectangleRing([1,2],[3,4]),[[1,2],[1,4],[3,4],[3,2],[1,2]]);
});
test("GeoJSON exports annotations without elevation guesses",()=>{
  const gj=annotationGeoJSON([{id:"a",kind:"rectangle",label:"ROI",points:[[1,2],[3,4]]}]);
  assert.equal(gj.type,"FeatureCollection");
  assert.equal(gj.features[0].geometry.type,"Polygon");
  assert.deepEqual(gj.features[0].geometry.coordinates[0][0],[1,2]);
});
