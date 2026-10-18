import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const source=await readFile(new URL("../lib/saved-investigations.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseViewParams,viewLink,readSavedViews,addSavedView,writeSavedViews,MAX_SAVED_VIEWS}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const input={hotspot:"F-01",before:"2026-07-03",after:"2026-09-25",pol:"HV",point:{x:.32,y:.68},provenance:"sample"};
test("bookmarks round-trip dates, polarization and normalized selected point through public links",()=>{
  const query=viewLink(input,"/SARS").split("?")[1];
  assert.deepEqual(parseViewParams(query),input);
  assert.match(viewLink(input,"/SARS"),/^\/SARS\/explore\/\?/);
});
test("bad or malformed deep links cannot inject unsupported polarizations or out-of-map points",()=>{
  assert.equal(parseViewParams("hotspot=%3Csvg%3E&before=2026-07-03&after=2026-09-25&pol=HH"),null);
  assert.equal(parseViewParams("hotspot=F-01&before=bad&after=2026-09-25&pol=HV"),null);
  assert.equal(parseViewParams("hotspot=F-01&before=2026-07-03&after=2026-09-25&pol=VV"),null);
  assert.equal(parseViewParams("hotspot=F-01&before=2026-07-03&after=2026-09-25&pol=HV&x=3&y=9").point,undefined);
});
test("saved browser views are bounded and structurally validated",()=>{
  const store=new Map();
  const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  const one=addSavedView(storage,input,"Rondônia July / September");
  assert.equal(one.length,1);
  assert.equal(one[0].label,"Rondônia July / September");
  const same=addSavedView(storage,input,"A new label");
  assert.equal(same.length,1);
  assert.equal(same[0].label,"A new label");
  writeSavedViews(storage,[{...one[0],pol:"VV"},...same]);
  assert.equal(readSavedViews(storage).length,1);
  for(let i=0;i<MAX_SAVED_VIEWS+8;i++){
    addSavedView(storage,{...input,hotspot:"F-"+i},"Study "+i);
  }
  assert.equal(readSavedViews(storage).length,MAX_SAVED_VIEWS);
});
test("corrupt local browser storage never crashes the discoveries page",()=>{
  const store={getItem:()=>"{not valid json"};
  assert.deepEqual(readSavedViews(store),[]);
});
