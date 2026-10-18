"use client";
import {useState} from "react";
import {ArrowRight,BookOpen,ChevronDown,FlaskConical,MapPin,ShieldAlert,ShieldCheck} from "lucide-react";
import {CompetitionShell,siteHref} from "@/components/site-navigation";
type Idea={label:string;signal:string;test:string;alternative:string};
const scenarios=[
  {id:"wetland",name:"Wetlands and water",hotspot:"W-01",
    question:"Could a backscatter change indicate different water conditions?",
    description:"Radar backscatter can respond to water surfaces, vegetation structure, moisture and observation conditions.",
    ideas:[
      {label:"Surface water or flooding",signal:"Open water may appear dark in some radar configurations, but vegetation-water interactions can produce bright returns.",test:"Compare independent water-level measurements, optical scenes with valid cloud masks, and consistent satellite geometry.",alternative:"Tides, soil moisture and seasonal vegetation growth can resemble or complicate a water signal."},
      {label:"Seasonal vegetation change",signal:"Canopy orientation, biomass and leaf or stem structure can change HH/HV backscatter.",test:"Compare repeated same-season acquisitions and local vegetation observations.",alternative:"Water level changes under vegetation can also affect the response."},
      {label:"Acquisition conditions",signal:"Differences between observing geometry, product maturity or calibration may change apparent brightness.",test:"Check orbit, pass direction, polarization, product version and masks first.",alternative:"Even closely matched acquisitions may show actual land-surface variation."},
    ]},
  {id:"forest",name:"Forests and disturbance",hotspot:"F-01",
    question:"Could changing radar response indicate disturbed vegetation?",
    description:"Forests produce complex scattering. Repeated L-band observations can suggest changes, but do not automatically classify tree loss.",
    ideas:[
      {label:"Possible clearing",signal:"Changes in the scattering contribution of trunks, leaves and ground may shift radar backscatter.",test:"Verify with independent optical imagery, field observations, land-cover maps and an appropriate classification method.",alternative:"Moisture and regrowth may alter backscatter without a confirmed clearing."},
      {label:"Moisture or seasonal variability",signal:"Rainfall, soil wetness and canopy water content affect returned radar power.",test:"Check weather history, seasonal context and repeat acquisitions.",alternative:"Disturbance may occur during the same period; examine both explanations."},
      {label:"Radar geometry or processing",signal:"Incidence angle, layover/shadow, masks and calibration can influence apparent differences.",test:"Check compatible acquisition geometry, quality masks and processing metadata.",alternative:"Compatible products can still register meaningful scattering change."},
    ]},
  {id:"earthquake",name:"Faults and ground motion",hotspot:"E-01",
    question:"Can radar measurements establish ground displacement?",
    description:"Interferometric phase products may help measure line-of-sight motion. GCOV intensity images alone cannot establish displacement.",
    ideas:[
      {label:"Possible ground deformation",signal:"Repeat-pass interferometry can reveal phase differences related to line-of-sight motion when coherence and processing are adequate.",test:"Obtain appropriate interferometric products (such as GUNW), review coherence, unwrapping, geometry, and independent geodetic measurements.",alternative:"Atmospheric delay, decorrelation and processing artifacts can affect interferograms."},
      {label:"Surface disturbance",signal:"GCOV backscatter may change after ground disruption but is not a displacement measurement.",test:"Corroborate with geological mapping, field surveys, or independently validated imagery.",alternative:"Vegetation, moisture and seasonal effects may change scattering without fault motion."},
      {label:"Not enough data",signal:"Without comparable interferometric acquisitions, a displacement inference is unsupported.",test:"Confirm the product type and signal characteristics before reporting motion.",alternative:"A sample illustration is useful for teaching but is not an observed event."},
    ]},
];
export function HypothesesExperience(){
  const [which,setWhich]=useState("wetland");
  const [selected,setSelected]=useState(0);
  const [considered,setConsidered]=useState<string[]>([]);
  const scenario=scenarios.find(s=>s.id===which)??scenarios[0];
  const idea=scenario.ideas[selected];
  function changeScenario(id:string){setWhich(id);setSelected(0);setConsidered([]);}
  return <CompetitionShell><div className="page-hub">
    <div className="hub-kicker"><FlaskConical size={16}/> HYPOTHESIS LAB / SCIENTIFIC REASONING</div>
    <div className="hub-heading">
      <div><h1>One radar signal. Several possible stories.</h1><p>Explore what could explain a change, what measurements might help, and why responsible scientists avoid jumping to conclusions.</p></div>
      <a className="hub-subtle-link" href={siteHref("/mission/")}>New to radar? Start a mission <ArrowRight size={16}/></a>
    </div>
    <div className="hypothesis-categories" role="group" aria-label="Select a landscape">
      {scenarios.map(s=><button type="button" key={s.id} aria-pressed={s.id===which} className={s.id===which?"selected":""} onClick={()=>changeScenario(s.id)}><MapPin size={16}/>{s.name}</button>)}
    </div>
    <div className="hypothesis-layout">
      <section className="hub-panel">
        <div className="hub-kicker">01 / INVESTIGATION QUESTION</div><h2>{scenario.question}</h2><p className="hub-muted">{scenario.description}</p>
        <div className="hypothesis-options"><h3>Explore explanations</h3>
          {scenario.ideas.map((candidate,i)=><button key={candidate.label} type="button" className={i===selected?"active":""} aria-pressed={i===selected} onClick={()=>setSelected(i)}>
            <span>{String(i+1).padStart(2,"0")}</span>{candidate.label}<ChevronDown size={15}/>
          </button>)}
        </div>
      </section>
      <section className="hub-panel hypothesis-evidence">
        <div className="hub-kicker">02 / TEST THIS HYPOTHESIS</div><h2>{idea.label}</h2>
        <div className="hypothesis-evidence-row"><span>WHAT RADAR MIGHT SHOW</span><p>{idea.signal}</p></div>
        <div className="hypothesis-evidence-row"><span>WHAT ADDITIONAL EVIDENCE HELPS</span><p>{idea.test}</p></div>
        <div className="hypothesis-evidence-row"><span>ALTERNATIVE EXPLANATION</span><p>{idea.alternative}</p></div>
        <div className="hypothesis-learning">
          <ShieldAlert size={17}/><p>This is a reasoning guide, not a classified detection. No measured NISAR surface-change evidence has been supplied for these sample scenarios.</p>
        </div>
        <div className="hypothesis-verification">
          <h3>What would you investigate next?</h3>
          {["Review suitable repeated SAR acquisitions","Check geometry, masks and processing provenance","Find independent field or optical confirmation"].map(check=><label key={check}><input type="checkbox" checked={considered.includes(check)} onChange={e=>setConsidered(current=>e.target.checked?[...current,check]:current.filter(v=>v!==check))}/>{check}</label>)}
          <p>{considered.length} of 3 questions considered. This is educational progress, not scientific confidence.</p>
        </div>
      </section>
    </div>
    <div className="hub-next-strip"><span><ShieldCheck size={16}/> Keep possible causes separate from validated findings.</span>
      <a href={siteHref("/explore/?hotspot="+encodeURIComponent(scenario.hotspot))}>Examine sample imagery <ArrowRight size={16}/></a>
      <a href={siteHref("/learn/")}><BookOpen size={15}/> Learn how SAR works</a>
    </div>
  </div></CompetitionShell>;
}
