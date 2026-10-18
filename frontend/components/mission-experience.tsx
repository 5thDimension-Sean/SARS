"use client";
import {useState} from "react";
import {ArrowRight,ArrowUpRight,BookOpen,ChevronLeft,ChevronRight,Compass,MapPin,ScanSearch,ShieldCheck} from "lucide-react";
import {CompetitionShell,siteHref} from "@/components/site-navigation";
import {studySites} from "@/lib/study-sites";
import data from "@/data/sample-data.json";
import type {DashboardDataset} from "@/lib/sample-schema";
import {viewLink} from "@/lib/saved-investigations";
const scenes=(data as DashboardDataset).phenomena.flatMap(p=>p.locations);
const steps=[
  {title:"Choose a question",subtitle:"Pick a landscape",body:"Every investigation starts with a real place and a question worth asking. The example imagery shown today is fictional."},
  {title:"Inspect the surface",subtitle:"Open the radar workspace",body:"Use the before/after divider, scroll at your cursor to zoom, and right-click to pan. Look for the illustrated changes and check the SAMPLE label."},
  {title:"Check the evidence",subtitle:"Separate signal from explanation",body:"In Explore, open Explore tools → Check Evidence. A different radar brightness is not enough to confirm a flood, clearing or earthquake."},
  {title:"Make a responsible conclusion",subtitle:"Tell the Earth story",body:"Describe what appears different, give at least two possible explanations, and identify what independent evidence would help. A sample demonstration is not a scientific detection."}
];
const questions=[
  "What stands out in the before-and-after images?",
  "What other environmental or acquisition conditions might change the radar signal?",
  "What outside observations would you need to validate the explanation?"
];
export function MissionExperience(){
  const [siteId,setSiteId]=useState(studySites[0].hotspotId);
  const [step,setStep]=useState(0);
  const [checks,setChecks]=useState([false,false,false]);
  const [answer,setAnswer]=useState("");
  const site=studySites.find(s=>s.hotspotId===siteId)??studySites[0];
  const scene=scenes.find(s=>s.id===site.hotspotId);
  const first=scene?.acquisitions[0],last=scene?.acquisitions.at(-1);
  const launchLink=first&&last?siteHref(viewLink({
    hotspot:site.hotspotId,before:first.date,after:last.date,
    pol:last.polarization.includes("HV")?"HV":"HH",provenance:"sample"
  })):siteHref("/explore/?hotspot="+encodeURIComponent(site.hotspotId));
  function selectSite(id:string){setSiteId(id);setStep(0);setChecks([false,false,false]);setAnswer("");}
  return <CompetitionShell>
    <div className="page-hub">
      <div className="hub-kicker"><Compass size={16}/> GUIDED MISSION · 4 STEPS · SAMPLE MODE</div>
      <div className="hub-heading">
        <div><h1>Your first Earth investigation.</h1><p>Discover a question, explore the radar, examine evidence, and explain your reasoning. No SAR experience required.</p></div>
        <a href={siteHref("/explore/")} className="hub-subtle-link">Already know what to do? Open Explore <ArrowUpRight size={16}/></a>
      </div>
      <div className="mission-layout">
        <aside className="mission-chooser">
          <h2>Choose your mission</h2>
          <p className="hub-muted">A new site changes the whole mission—not the underlying scientific limitations.</p>
          <div className="mission-choices">{studySites.map(s=><button key={s.hotspotId} type="button" className={site.hotspotId===s.hotspotId?"selected":""}
            aria-pressed={site.hotspotId===s.hotspotId} onClick={()=>selectSite(s.hotspotId)}>
            <MapPin size={15}/><span><strong>{s.name}</strong><small>{s.tag} · {s.region}</small></span>
          </button>)}</div>
          <p className="hub-source-note"><ShieldCheck size={15}/> All current walkthroughs are sample demonstrations, not measured NISAR changes.</p>
        </aside>
        <section className="mission-wizard" aria-label="Guided mission steps">
          <div className="mission-stepper">{steps.map((item,i)=><button type="button" key={item.title} className={step===i?"active":""}
            onClick={()=>setStep(i)} aria-current={step===i?"step":undefined}><span>{String(i+1).padStart(2,"0")}</span>{item.subtitle}</button>)}</div>
          <div className="mission-step-content">
            <div className="hub-kicker">STEP {step+1} / 4 · {site.name.toUpperCase()}</div>
            <h2>{steps[step].title}</h2>
            <p>{steps[step].body}</p>
            {step===0&&<div className="mission-question"><span>YOUR INVESTIGATION QUESTION</span><strong>{site.headline}</strong><p>{site.stakes}</p></div>}
            {step===1&&<div className="mission-question"><span>IN THE RADAR WORKSPACE</span><strong>Compare two acquisition dates</strong><p>Open Explore, use the date timeline, then drag the before/after divider. The existing zoom and inspection tools remain available.</p></div>}
            {step===2&&<div className="mission-question"><span>WHAT THE RADAR CAN AND CANNOT SHOW</span><strong>{site.radarCanShow}</strong><p>{site.caution}</p></div>}
            {step===3&&<div className="mission-question"><span>RESEARCHER&apos;S REFLECTION</span>
              <div className="mission-checks">{questions.map((q,i)=><label key={q}>
                <input type="checkbox" checked={checks[i]} onChange={e=>setChecks(old=>old.map((v,k)=>k===i?e.target.checked:v))}/><span>{q}</span>
              </label>)}</div>
              <label className="mission-reflection-label" htmlFor="mission-reflection">Write your interpretation (saved only while this page remains open)</label>
              <textarea id="mission-reflection" value={answer} onChange={e=>setAnswer(e.target.value)} rows={4} placeholder="The sample suggests..., but I would need ... to verify it."/>
              <p className="hub-muted">Reflection only—checking boxes does not validate a physical event.</p>
            </div>}
            <div className="mission-step-actions">
              <button type="button" disabled={step===0} onClick={()=>setStep(v=>Math.max(0,v-1))}><ChevronLeft size={16}/> Previous</button>
              {step<3?<button type="button" className="hub-primary" onClick={()=>setStep(v=>Math.min(3,v+1))}>Next step <ChevronRight size={16}/></button>:
                <button type="button" className="hub-primary" onClick={()=>{setStep(0);setChecks([false,false,false]);setAnswer("");}}>Restart mission <Compass size={15}/></button>}
              <a href={launchLink} className="hub-action-link">Open {site.name} in Explore <ArrowUpRight size={16}/></a>
            </div>
          </div>
        </section>
      </div>
      <div className="hub-next-strip">
        <span><ScanSearch size={16}/> Want to investigate a different location?</span>
        <a href={siteHref("/discoveries/")}>Browse Discoveries <ArrowRight size={16}/></a>
        <a href={siteHref("/hypotheses/")}><BookOpen size={15}/> Explore scientific explanations</a>
      </div>
    </div>
  </CompetitionShell>;
}
