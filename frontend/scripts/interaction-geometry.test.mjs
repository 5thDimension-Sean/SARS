import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const src=await readFile(new URL("../lib/interaction-geometry.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {shrinkPanel,clampMapPan,zoomMapAtPoint}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
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

test("wheel zoom keeps the exact map source point beneath cursor",()=>{
  const pan={x:0,y:0},width=1000,height=600;
  const x=710,y=180;
  const next=zoomMapAtPoint(1,1.7,pan,width,height,x,y);
  assert.equal(next.zoom,1.7);
  assert.equal(next.pan.x,(x-width/2)*(1-1.7));
  assert.equal(next.pan.y,(y-height/2)*(1-1.7));
  const sourceBefore={x:(x-width/2-pan.x)/1,y:(y-height/2-pan.y)/1};
  const sourceAfter={x:(x-width/2-next.pan.x)/next.zoom,y:(y-height/2-next.pan.y)/next.zoom};
  assert.ok(Math.abs(sourceBefore.x-sourceAfter.x)<1e-8);
  assert.ok(Math.abs(sourceBefore.y-sourceAfter.y)<1e-8);
});
test("zooming out restores pointer-anchored view and respects limits",()=>{
  const first=zoomMapAtPoint(1,2,{x:0,y:0},800,500,500,180);
  const reset=zoomMapAtPoint(first.zoom,1,first.pan,800,500,500,180);
  assert.deepEqual(reset,{zoom:1,pan:{x:0,y:0}});
  assert.deepEqual(zoomMapAtPoint(1,0.3,{x:0,y:0},800,500,400,250),reset);
  assert.equal(zoomMapAtPoint(2.9,8,{x:0,y:0},800,500,700,250).zoom,3);
  const zoomed=zoomMapAtPoint(1,3,{x:0,y:0},800,500,750,350);
  assert.ok(Math.abs(zoomed.pan.x)<=800);
  assert.ok(Math.abs(zoomed.pan.y)<=500);
});
