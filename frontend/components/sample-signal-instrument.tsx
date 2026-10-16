"use client";

import {useMemo,useState} from "react";
import {ArrowUpRight,Maximize2,SlidersHorizontal} from "lucide-react";
import sampleData from "@/data/sample-data.json";
import type {DashboardDataset, HistogramBin, ProfilePoint} from "@/lib/sample-schema";
import {siteHref} from "@/components/site-navigation";

const data=sampleData as DashboardDataset;
const tabs=[
  {id:"W-01",label:"Everglades",caption:"Wetlands",category:"WATER"},
  {id:"F-01",label:"Rondônia",caption:"Forests",category:"FOREST"},
  {id:"E-01",label:"Parkfield",caption:"Ground motion",category:"FAULT"}
] as const;

function SignalPlot({histogram,profile,mode}:{histogram:HistogramBin[];profile:ProfilePoint[];mode:"backscatter"|"displacement"}) {
  const entries=mode==="displacement" && profile.length>1
    ? profile.map(p=>({x:p.distanceKm,y:p.displacementCm}))
    : histogram.map(p=>({x:p.db,y:p.HV}));
  const xs=entries.map(p=>p.x),ys=entries.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs);
  const minY=Math.min(0,...ys),maxY=Math.max(1,...ys);
  const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
  const coords=entries.map(({x,y})=>[42+(x-minX)/spanX*534,204-(y-minY)/spanY*166]);
  const polyline=coords.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ");
  const start=coords[0]??[42,204],end=coords[coords.length-1]??[576,204];
  return <svg viewBox="0 0 620 240" preserveAspectRatio="xMidYMid meet" role="img" aria-label={mode==="backscatter"?"Sample HV backscatter distribution plotted from fictional histogram bins":"Sample displacement profile plotted from fictional profile points"} className="precision-plot">
    <defs>
      <linearGradient id="sample-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#84e5dc" stopOpacity=".27"/><stop offset="1" stopColor="#84e5dc" stopOpacity="0"/></linearGradient>
      <linearGradient id="sample-chart-stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4e8391"/><stop offset=".5" stopColor="#b9f7ef"/><stop offset="1" stopColor="#6dd1cf"/></linearGradient>
    </defs>
    {[45,85,125,165,204].map(y=><line key={y} x1="42" y1={y} x2="576" y2={y} stroke="#35515a" strokeDasharray="2 8"/>)}
    {[42,176,309,442,576].map(x=><line key={x} x1={x} y1="30" x2={x} y2="205" stroke="#233840" strokeDasharray="2 8"/>)}
    {coords.length>1&&<>
      <polygon points={start[0]+",204 "+polyline+" "+end[0]+",204"} fill="url(#sample-chart-fill)"/>
      <polyline points={polyline} fill="none" stroke="url(#sample-chart-stroke)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>
      {coords.filter((_,i)=>i%Math.max(1,Math.ceil(coords.length/12))===0).map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="2.3" fill="#b8e9e9"/>)}
    </>}
    <text x="43" y="227" fontSize="10" fill="#89a2a9" fontFamily="monospace">{mode==="displacement"?"DISTANCE (KM)":"BACKSCATTER (DB)"}</text>
    <text x="575" y="227" textAnchor="end" fontSize="10" fill="#89a2a9" fontFamily="monospace">SAMPLE · NOT OBSERVED</text>
  </svg>;
}

export function SampleSignalInstrument() {
  const [id,setId]=useState<string>("W-01");
  const [mode,setMode]=useState<"HH"|"HV">("HV");
  const selected=useMemo(()=>{
    for(const phenomenon of data.phenomena){
      const hotspot=phenomenon.locations.find(l=>l.id===id);
      if(hotspot)return {phenomenon,hotspot,acquisition:hotspot.acquisitions.at(-1)!};
    }
    const phenomenon=data.phenomena[0];
    return {phenomenon,hotspot:phenomenon.locations[0],acquisition:phenomenon.locations[0].acquisitions.at(-1)!};
  },[id]);
  const isDisplacement=selected.phenomenon.analysis==="displacement";
  const latest=selected.acquisition;
  const primary=latest.metrics.find(m=>m.id==="primary")??latest.metrics[0];
  const numeric=primary?.value;
  const metricDisplay=numeric==null?"N/A":Number(numeric).toLocaleString("en-US",{maximumFractionDigits:2});
  const scene=tabs.find(t=>t.id===selected.hotspot.id)??tabs[0];
  const samplePlot=latest.histogramBinsDb.map(b=>({...b,HV:mode==="HH"?b.HH:b.HV}));
  return <div className="precision-instrument" aria-label="Interactive sample radar data demonstration">
    <div className="precision-instrument-frame">
      <div className="precision-instrument-top">
        <div className="precision-lights" aria-hidden="true"><i/><i/><i/></div>
        <span>SAR-WALTZ / SAMPLE SIGNAL VIEWER</span>
        <span className="precision-sample-flag">● DEMONSTRATION</span>
      </div>
      <div className="precision-instrument-heading">
        <div><span className="precision-instrument-overline">01 / CHOOSE A SURFACE</span><h2>{scene.label}<span> / {scene.caption}</span></h2></div>
        <span className="precision-instrument-coordinate">{selected.hotspot.coordinates.latitude.toFixed(3)}° / {selected.hotspot.coordinates.longitude.toFixed(3)}°</span>
      </div>
      <div className="precision-instrument-tabs" role="group" aria-label="Choose a sample radar scenario">
        {tabs.map(t=><button key={t.id} type="button" className={id===t.id?"active":""} aria-pressed={id===t.id} onClick={()=>setId(t.id)}><span>{t.category}</span>{t.label}</button>)}
      </div>
      <div className="precision-instrument-window">
        <div className="precision-signal-topline"><span><i/> {isDisplacement?"ILLUSTRATIVE DISPLACEMENT PROFILE":"ILLUSTRATIVE BACKSCATTER DISTRIBUTION"}</span><span>{latest.productType} / {latest.date}</span></div>
        <SignalPlot histogram={samplePlot} profile={latest.displacementProfileCm} mode={selected.phenomenon.analysis}/>
        <div className="precision-graph-controls"><span><SlidersHorizontal size={14}/> SIGNAL VIEW</span>{!isDisplacement&&<div role="group" aria-label="Sample polarization">{(["HH","HV"] as const).map(p=><button type="button" key={p} aria-pressed={mode===p} onClick={()=>setMode(p)} className={mode===p?"active":""}>{p}</button>)}</div>}<span>ILLUSTRATIVE VALUES</span></div>
      </div>
      <div className="precision-instrument-bottom">
        <div><span>SELECTED MEASUREMENT</span><strong>{metricDisplay} <small>{primary?.unit??""}</small></strong><p>{primary?.label??"Sample measurement"}</p></div>
        <div><span>SOURCE STATUS</span><strong className="precision-small-metric">SAMPLE</strong><p>Fictional values / real coordinates</p></div>
        <a href={siteHref("/explore/?hotspot="+selected.hotspot.id)}>Full workspace <ArrowUpRight size={16}/></a>
      </div>
    </div>
    <div className="precision-instrument-under"><span>◌ DISPLAY MODULE / 01</span><span>RADAR OBSERVATION · PROTOTYPE</span><Maximize2 size={13}/></div>
  </div>;
}
