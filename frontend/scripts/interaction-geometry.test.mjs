import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const src=await readFile(new URL("../lib/interaction-geometry.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {shrinkPanel,clampMapPan}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const max={width:330,height:750};
const min={width:180,height:300};
const original={width:330,height:750,left:0,top:0};
test("right and bottom borders only shrink, never grow",()=>{
  assert.deepEqual(shrinkPanel(original,"e",-70,0,max,min),{width:260,height:750,left:0,top:0});
  assert.deepEqual(shrinkPanel(original,"s",0,-100,max,min),{width:330,height:650,left:0,top:0});
  assert.deepEqual(shrinkPanel(original,"se",-40,-80,max,min),{width:290,height:670,left:0,top:0});
  assert.deepEqual(shrinkPanel(original,"se",300,300,max,min),original);
});
test("left and top borders shrink inward keeping opposite edge fixed",()=>{
  assert.deepEqual(shrinkPanel(original,"w",80,0,max,min),{width:250,height:750,left:80,top:0});
  assert.deepEqual(shrinkPanel(original,"n",0,120,max,min),{width:330,height:630,left:0,top:120});
  assert.deepEqual(shrinkPanel(original,"nw",100,200,max,min),{width:230,height:550,left:100,top:200});
});
test("minimum dimensions and default maximum are enforced",()=>{
  let rectangle=shrinkPanel(original,"se",-900,-900,max,min);
  assert.equal(rectangle.width,180);
  assert.equal(rectangle.height,300);
  const res=shrinkPanel(rectangle,"se",1500,1500,max,min);
  assert.equal(res.width,330);
  assert.equal(res.height,750);
});
test("zoomed imagery pans only within visible coverage bounds",()=>{
  assert.deepEqual(clampMapPan(1000,-1000,2,800,500),{x:400,y:-250});
  assert.deepEqual(clampMapPan(20,20,1,800,500),{x:0,y:0});
  assert.deepEqual(clampMapPan(-55,30,2.5,800,500),{x:-55,y:30});
});
