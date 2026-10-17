"use client";

import {useEffect,useRef,useState,type CSSProperties} from "react";
import {ArrowUpRight,RotateCcw} from "lucide-react";
import sampleData from "@/data/sample-data.json";
import type {DashboardDataset} from "@/lib/sample-schema";
import {mapTourSteps,TOUR_INTERVAL_MS} from "@/lib/sample-map-tour";
import {siteHref} from "@/components/site-navigation";

const dataset=sampleData as DashboardDataset;
const everglades=dataset.phenomena.flatMap(p=>p.locations).find(h=>h.id==="W-01");
const dates=everglades?.acquisitions.map(a=>a.date)??[];
const A:[number,number]=[117,148],B:[number,number]=[399,77],C:[number,number]=[530,240],D:[number,number]=[248,329];

/** Regular geometry, not a geographic raster, terrain model, or measured land cover. */
function surface(u:number,v:number):[number,number] {
  const x=A[0]*(1-u)*(1-v)+B[0]*u*(1-v)+C[0]*u*v+D[0]*(1-u)*v;
  const y=A[1]*(1-u)*(1-v)+B[1]*u*(1-v)+C[1]*u*v+D[1]*(1-u)*v;
  return [x,y];
}
function gridLine(constant:number,axis:"u"|"v") {
  const vertices=Array.from({length:17},(_,i)=>{
    const t=i/16;const [x,y]=axis==="u"?surface(constant,t):surface(t,constant);
    return (i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);
  });
  return vertices.join(" ");
}
const contours=[
  "M140 190 C230 142 280 156 352 121 S447 146 505 201",
  "M142 214 C227 165 286 184 354 145 S443 165 500 219",
  "M153 244 C239 194 299 205 370 168 S454 194 510 239",
  "M181 267 C246 228 303 232 365 200 S442 211 489 254",
  "M216 286 C269 261 312 255 374 227 S433 240 461 269"
];
const waterChannels=[
  "M179 171 C228 208 261 206 295 247 S376 268 414 237",
  "M249 123 C267 163 310 174 338 211 S384 233 433 267",
  "M389 110 C369 153 345 161 338 211"
];
const patches=[
  "220,167 263,146 306,174 298,211 249,219",
  "375,171 416,145 448,185 434,231 394,224",
  "281,249 330,231 366,255 351,287 308,300"
];
const buildings:Array<[number,number]>=[[394,205],[403,210],[413,201],[421,218],[435,215],[416,228],[443,228]];

function WireframeLandscape({index}:{index:number}) {
  const step=mapTourSteps[index];
  const focused=step.focus;
  const {point}=step;
  const turnStyle={"--map-turn":step.turn+"deg"} as CSSProperties;
  return <div className="sample-wireframe-perspective" key={step.id} style={turnStyle}>
    <svg viewBox="0 0 640 430" xmlns="http://www.w3.org/2000/svg" className="sample-wireframe-svg" role="img"
      aria-label={"An original animated three-dimensional schematic map. Active example: "+step.shortLabel+". This is not real NASA satellite imagery."}>
      <defs>
        <clipPath id="tour-ground-clip"><path d="M117 148L399 77L530 240L248 329Z"/></clipPath>
        <linearGradient id="tour-surface-light" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#102731"/><stop offset=".5" stopColor="#122d33"/><stop offset="1" stopColor="#091922"/></linearGradient>
        <linearGradient id="tour-metal" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#4b6874" stopOpacity=".4"/><stop offset="1" stopColor="#132630" stopOpacity=".06"/></linearGradient>
        <radialGradient id="tour-focus-glow"><stop stopColor="#a5f5ec" stopOpacity=".65"/><stop offset="1" stopColor="#a5f5ec" stopOpacity="0"/></radialGradient>
      </defs>
      <g className="wireframe-dimension" fill="none" stroke="#536c75" strokeWidth=".75">
        <path d="M117 148L83 116L105 91M399 77L413 42L578 215L530 240" opacity=".35"/>
        <path d="M117 115L399 44 M110 113L122 117 M394 39L404 48" opacity=".5"/>
        <path d="M552 240L552 302M546 242L559 240M547 302L558 302" opacity=".45"/>
        <text x="261" y="65" fill="#9fbecb" fontSize="9" stroke="none" fontFamily="monospace">REGION / SAMPLE</text>
      </g>
      <g className="wireframe-structural">
        <path className="wire-draw wire-delay-0" pathLength="1" d="M117 148L399 77L530 240L248 329Z" fill="url(#tour-surface-light)" stroke="#e9f6f6" strokeWidth="1.8"/>
        <path className="wire-draw wire-delay-1" pathLength="1" d="M117 148L117 196L248 380L248 329Z" fill="url(#tour-metal)" stroke="#9fbac1" strokeWidth="1.35"/>
        <path className="wire-draw wire-delay-1" pathLength="1" d="M248 329L248 380L530 289L530 240" fill="#0a1c25" stroke="#bfd1d7" strokeWidth="1.25"/>
        <path className="wire-draw wire-delay-2" pathLength="1" d="M399 77L399 127L530 289" fill="none" stroke="#758f9a" strokeWidth=".7" opacity=".6"/>
        {Array.from({length:9},(_,i)=><path key={"side"+i} d={"M"+(129+i*13)+" "+(211+i*17.5)+"l0 18"} stroke="#a2b8c1" strokeWidth=".7" fill="none" opacity=".28"/>)}
      </g>
      <g clipPath="url(#tour-ground-clip)">
        <g opacity={focused==="extent"?.77:.3} fill="none" stroke="#94b7bf" strokeWidth=".7">
          {Array.from({length:12},(_,i)=><path className="wire-draw wire-grid" pathLength="1" key={"u"+i} d={gridLine((i+1)/13,"u")}/>)}
          {Array.from({length:10},(_,i)=><path className="wire-draw wire-grid" pathLength="1" key={"v"+i} d={gridLine((i+1)/11,"v")}/>)}
        </g>
        <g opacity={focused==="extent"?.78:.43} fill="none" stroke="#8ca9ad" strokeWidth="1">
          {contours.map((d,i)=><path key={i} className="wire-draw wire-contour" pathLength="1" d={d} style={{animationDelay:(.45+i*.14)+"s"}}/>)}
        </g>
        <g className={"wire-map-feature "+(focused==="water"?"is-focused":"")} fill="none" stroke="#65cbdc" strokeLinecap="round">
          {waterChannels.map((d,i)=><path className="wire-draw wire-channel" pathLength="1" key={i} d={d} strokeWidth={focused==="water"?3.2:1.5} style={{animationDelay:(.9+i*.16)+"s"}}/>)}
        </g>
        <g className={"wire-map-feature "+(focused==="vegetation"?"is-focused":"")} stroke="#8fdbb3" strokeWidth="1.3" fill="#66c7a319">
          {patches.map((points,i)=><polygon key={i} points={points} className="wire-draw wire-patch" pathLength="1"/>)}
        </g>
        <g className={"wire-map-feature "+(focused==="urban"?"is-focused":"")} stroke="#d6e4e9" strokeWidth="1.1" fill="none">
          {buildings.map(([x,y],i)=><g key={i}><path d={"M"+x+" "+y+"l7 -2 5 6 -7 3Z"} /><path d={"M"+x+" "+y+"v-10l7 -2v10M"+(x+7)+" "+(y-12)+"l5 6v10"}/></g>)}
        </g>
        {(focused==="change"||focused==="annotation")&&<polygon className="wire-highlight-region" points="290,163 338,144 384,184 363,231 309,224" fill={focused==="change"?"#f2c07a39":"#83e4cc29"} stroke={focused==="change"?"#f4c37b":"#99f2de"} strokeWidth="2" strokeDasharray="6 5"/>}
        {focused==="transect"&&<path className="wire-transect" d="M188 226L442 181" stroke="#f2c88e" strokeWidth="2.5" strokeDasharray="7 6" fill="none"/>}
        {focused==="timing"&&<g><path d="M196 248L424 178" stroke="#ace9e0" strokeWidth="1.5" strokeDasharray="8 7"/><circle cx="231" cy="237" r="6" fill="#addfd9"/><circle cx="386" cy="190" r="6" fill="#f5c58b"/></g>}
        {focused==="polarization"&&<g><path d="M161 182L425 109" stroke="#c3eedd" strokeWidth="2" strokeDasharray="10 7"/><path d="M216 294L484 209" stroke="#edbe85" strokeWidth="2" strokeDasharray="3 9"/></g>}
        {focused==="provenance"&&<rect x="260" y="150" width="138" height="74" rx="4" fill="#0e2a2dd9" stroke="#a5e8dc" strokeDasharray="5 5"/>}
      </g>
      <g className="wireframe-callout">
        <circle cx={point[0]} cy={point[1]} r="26" fill="url(#tour-focus-glow)"/>
        <circle className="wire-pulse" cx={point[0]} cy={point[1]} r="16" fill="none" stroke="#cafdef" strokeWidth="1.15"/>
        <circle cx={point[0]} cy={point[1]} r="4.3" fill="#b9fff1"/>
        <path d={"M"+point[0]+" "+point[1]+" L498 93 L570 93"} fill="none" stroke="#b2e6db" strokeWidth="1.2" className="wire-draw wire-callout" pathLength="1"/>
        <rect x="521" y="74" width="46" height="16" rx="2" fill="#0c2027" stroke="#659c9c" strokeWidth=".6"/>
        <text x="544" y="85.4" fontSize="9.4" textAnchor="middle" fill="#c2fff1" fontFamily="monospace" letterSpacing="1">{String(step.id).padStart(2,"0")}</text>
        <text x="501" y="70" fontSize="8" fill="#9dc4cb" fontFamily="monospace">ACTIVE</text>
      </g>
      <text x="90" y="411" fill="#73959e" fontSize="9" fontFamily="monospace">ILLUSTRATIVE MODEL / NOT A MAP PRODUCT</text>
    </svg>
  </div>;
}

export function SampleMapTour(){
  const [index,setIndex]=useState(0);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [inView,setInView]=useState(true);
  const rootRef=useRef<HTMLElement>(null);

  useEffect(()=>{
    const mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    function syncMotion(){setReducedMotion(mq.matches);}
    syncMotion();
    mq.addEventListener("change",syncMotion);
    return()=>mq.removeEventListener("change",syncMotion);
  },[]);
  useEffect(()=>{
    if(!rootRef.current||!("IntersectionObserver" in window))return;
    const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.06});
    observer.observe(rootRef.current);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(reducedMotion||!inView)return;
    const timeout=window.setTimeout(()=>setIndex(i=>(i+1)%mapTourSteps.length),TOUR_INTERVAL_MS);
    return()=>window.clearTimeout(timeout);
  },[reducedMotion,inView,index]);

  const step=mapTourSteps[index];
  const moving=!reducedMotion&&inView;

  return <section className="sample-map-tour" ref={rootRef} aria-label="Ten-step sample SAR map walkthrough">
    <div className="sample-map-tour-header">
      <div className="sample-map-tour-heading"><span className="sample-map-tour-led"/><span>SAR-WALTZ / WIRE-FRAME FIELD EXPLORER</span></div>
      <span className="sample-map-tour-data">SAMPLE DATA ONLY</span>
    </div>
    <div className="sample-map-tour-layout">
      <div className="sample-map-canvas">
        <div className="sample-map-canvas-label">GEOGRAPHIC SCHEMATIC // ISOMETRIC VIEW</div>
        <WireframeLandscape index={index}/>
        <span className="sample-map-coordinate">EVERGLADES · {everglades?.coordinates.latitude.toFixed(4)}° N / {Math.abs(everglades?.coordinates.longitude??0).toFixed(4)}° W</span>
        <span className="sample-map-orientation">VIEW 0{index+1} / 10</span>
      </div>
      <div className="sample-map-tour-list">
        <p>TOUR FEATURES</p>
        <div className="sample-map-tour-list-scroll" aria-label="Features shown automatically in sequence">
          {mapTourSteps.map((item,i)=><div key={item.id} className={"sample-map-tour-option"+(i===index?" active":"")} aria-current={i===index?"step":undefined}>
            <span>{String(item.id).padStart(2,"0")}</span><span>{item.shortLabel}</span>
          </div>)}
        </div>
      </div>
    </div>
    <div className="sample-map-tour-description" key={index}>
      <div className="sample-map-tour-meta">
        <span>{String(step.id).padStart(2,"0")} <i>/</i> 10</span>
        <span>{step.eyebrow}</span>
      </div>
      <h2>{step.title}</h2>
      <p>{step.description}</p>
      <div className="sample-map-tour-tags">{step.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
      <div className="sample-map-tour-insight">{step.insight}</div>
    </div>
    <div className="sample-map-tour-bottom">
      <span className="sample-map-tour-quiet-label">{reducedMotion?"STATIC VIEW":"AUTOMATED FIELD WALKTHROUGH"}</span>
      <a href={siteHref("/explore/?hotspot=W-01")} title="Explore the original sample Everglades scenario">EXPLORE DATA <ArrowUpRight size={14}/></a>
    </div>
    <div className="sample-map-progress" aria-hidden="true">
      {mapTourSteps.map((s,i)=><span key={s.id} className={"sample-map-progress-item"+(i===index?" active":"")}>
        <span className={i===index&&moving?"is-running":""}/>
      </span>)}
    </div>
    <div className="sample-map-tour-footnote">
      <RotateCcw size={12}/> Conceptual wireframe; fictional sample measurements, not satellite imagery.
      <span>{dates.length} illustrative acquisitions · no observed events claimed</span>
    </div>
  </section>;
}
