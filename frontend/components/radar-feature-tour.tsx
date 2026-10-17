"use client";

import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,Layers3,MoveHorizontal,PencilRuler,ShieldCheck,ScanSearch} from "lucide-react";
import {siteHref} from "@/components/site-navigation";

const stages=[
  {
    number:"01",name:"Visualize",eyebrow:"RADAR INTENSITY",title:"Turn unfamiliar radar measurements into something you can explore.",
    description:"Inspect sample backscatter patterns in HH and HV polarization. Instead of a decorative satellite image, we begin with signals, acquisitions, and the questions they raise.",
    insight:"A brighter pixel does not automatically mean a more important change.",
    link:"/explore/",linkText:"Open radar console",Icon:ScanSearch,
  },
  {
    number:"02",name:"Compare",eyebrow:"CHANGE OVER TIME",title:"One place. Two moments. A meaningful comparison.",
    description:"Move between acquisitions on the timeline and use the before-and-after tools to investigate differences. Time, orbit geometry, and processing choices matter just as much as color.",
    insight:"A change in radar response is evidence of a changing signal, not proof of its cause.",
    link:"/explore/",linkText:"Explore comparisons",Icon:MoveHorizontal,
  },
  {
    number:"03",name:"Annotate",eyebrow:"GEOGRAPHIC FIELD NOTES",title:"Draw the question directly on the map.",
    description:"Place markers, trace regions, measure approximate distances and areas, and export your geographic annotations as GeoJSON. Keep the geography tied to real coordinates.",
    insight:"A drawn polygon is a geographic annotation; raster statistics require valid georeferenced data.",
    link:"/map/",linkText:"Open map tools",Icon:PencilRuler,
  },
  {
    number:"04",name:"Validate",eyebrow:"SCIENTIFIC TRANSPARENCY",title:"Show what the data supports—and what it doesn't.",
    description:"Our interface distinguishes fictional sample measurements from derived satellite products. The original processing notes, acquisition dates, and scientific limitations remain part of the story.",
    insight:"Scientific credibility starts with source transparency, not invented certainty.",
    link:"/learn/",linkText:"Understand the science",Icon:ShieldCheck,
  },
] as const;

export function RadarFeatureTour(){
  const [active,setActive]=useState(0);
  const steps=useRef<(HTMLDivElement|null)[]>([]);
  // Choose the stage from a fixed reading line, not individual observer entries.
  // IntersectionObserver callbacks can omit still-visible stages, causing bounce.
  useEffect(()=>{
    let frame=0;
    const update=()=>{
      frame=0;
      const readingLine=window.innerHeight*0.38;
      let next=0;
      for(let i=0;i<steps.current.length;i++){
        const element=steps.current[i];
        if(element&&element.getBoundingClientRect().top<=readingLine)next=i;
      }
      setActive(previous=>previous===next?previous:next);
    };
    const schedule=()=>{
      if(!frame)frame=window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll",schedule,{passive:true});
    window.addEventListener("resize",schedule);
    return()=>{
      window.removeEventListener("scroll",schedule);
      window.removeEventListener("resize",schedule);
      if(frame)window.cancelAnimationFrame(frame);
    };
  },[]);
  const current=stages[active];
  const Icon=current.Icon;
  return <section className="feature-tour" aria-labelledby="feature-tour-title">
    <div className="feature-tour-intro" data-reveal>
      <p className="story-eyebrow">03 / THE INSTRUMENTS</p>
      <h2 id="feature-tour-title">A real investigation.<br/><em>Not just another image.</em></h2>
      <p>Scroll to discover the workflow, or select a tool to jump directly to its scientific purpose. The preview is a conceptual instrument view; it does not display a measured SAR raster.</p>
    </div>
    <div className="feature-tour-grid">
      <div className="feature-tour-steps">
        {stages.map((stage,i)=>{
          const StageIcon=stage.Icon;
          return <div key={stage.number} className={"feature-tour-step"+(active===i?" is-active":"")}
            data-step-index={i} ref={el=>{steps.current[i]=el}}>
            <button type="button" aria-pressed={active===i} className="feature-step-heading"
              onClick={()=>steps.current[i]?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}>
              <span>{stage.number} / 04</span>
              <StageIcon size={19} aria-hidden="true"/>
              <strong>{stage.name}</strong>
              <span className="feature-step-arrow" aria-hidden="true">↗</span>
            </button>
            <div className="feature-step-details">
              <p className="feature-step-eyebrow">{stage.eyebrow}</p>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
              <p className="feature-step-insight"><ShieldCheck size={15}/> {stage.insight}</p>
              <a href={siteHref(stage.link)}>{stage.linkText} <ArrowUpRight size={16}/></a>
            </div>
          </div>;
        })}
      </div>
      <div className="feature-tour-sticky">
        <div className="feature-tour-display" aria-live="off">
          <div className="feature-tour-topline"><span>DEMONSTRATION / INTERFACE SYSTEM</span><span>0{active+1} — 04</span></div>
          <div className="feature-tour-stage" key={active}>
            <div className="feature-tour-scene">
              <div className={"feature-graphic feature-graphic-"+active} aria-hidden="true">
                <div className="feature-graphic-grid"/>
                {active===0&&<><div className="feature-radar-ring"/><div className="feature-radar-ring second"/><div className="feature-signal-bars">{[32,45,39,65,81,73,91,69,58,43,29,48,62,56,38,22,33,49,36,25].map((n,i)=><i key={i} style={{height:n+"%"}}/>)}</div><span className="feature-graphic-label">HH · HV SAMPLE DISTRIBUTION</span></>}
                {active===1&&<><div className="feature-compare-half before"/><div className="feature-compare-half after"/><div className="feature-compare-divider"><MoveHorizontal size={18}/></div><span className="feature-graphic-label">BEFORE / AFTER · ILLUSTRATIVE</span></>}
                {active===2&&<><svg viewBox="0 0 500 320" preserveAspectRatio="none" className="feature-region-drawing"><path d="M104 235L166 75L297 108L370 231L227 271Z" stroke="#a8f3e3" fill="#7dd0bf30" strokeWidth="2" strokeDasharray="6 7"/>{[[104,235],[166,75],[297,108],[370,231],[227,271]].map(([x,y],i)=><circle cx={x} cy={y} r="6" fill="#d9fff7" key={i}/>)}</svg><span className="feature-graphic-label">SAMPLE REGION / GEOGRAPHIC ANNOTATION</span></>}
                {active===3&&<><div className="feature-provenance-card"><span>01 / SOURCE</span><strong>SAMPLE · ILLUSTRATIVE</strong><p>Fictional acquisitions and values</p></div><div className="feature-provenance-card second"><span>02 / SCIENTIFIC LIMIT</span><strong>Signal ≠ cause</strong><p>Requires validation and independent context</p></div><span className="feature-graphic-label">PROVENANCE / NO FABRICATED CONFIDENCE</span></>}
              </div>
            </div>
            <div className="feature-tour-annotation">
              <span className="feature-annotation-index">{current.number}</span>
              <div><p>{current.eyebrow}</p><h3>{current.name}</h3></div>
              <Icon size={24}/>
            </div>
          </div>
          <div className="feature-tour-footer"><span>VISUAL SCHEMATIC · NOT SATELLITE IMAGERY</span><div className="feature-progress" aria-label={"Step "+(active+1)+" of "+stages.length}>{stages.map((s,i)=><i className={i===active?"active":""} key={s.number}/>)}</div></div>
        </div>
      </div>
    </div>
  </section>;
}
