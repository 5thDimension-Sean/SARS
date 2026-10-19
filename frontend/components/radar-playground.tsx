"use client";
import {useState} from "react";
import {ArrowRight,BookOpen,Compass,Droplets,Mountain,RefreshCcw,SlidersHorizontal,Trees,TriangleAlert} from "lucide-react";
import {CompetitionShell,siteHref} from "@/components/site-navigation";

type Controls={water:number;vegetation:number;roughness:number};
const presets:{name:string;description:string;controls:Controls}[]=[
  {name:"Wetland",description:"Water, stems, and mixed surface reflections",controls:{water:65,vegetation:55,roughness:25}},
  {name:"Forest",description:"Complex vegetation structure dominates the illustration",controls:{water:12,vegetation:88,roughness:45}},
  {name:"Open water",description:"Smooth water often sends radar energy away from the sensor",controls:{water:95,vegetation:5,roughness:10}},
  {name:"Rough ground",description:"An uneven surface produces more varied scattering",controls:{water:8,vegetation:15,roughness:95}}
];
function category(value:number){return value<30?"Low":value<67?"Moderate":"High";}
function getExplanation({water,vegetation,roughness}:Controls){
  if(water>=70&&vegetation<25&&roughness<35)
    return {title:"A smoother open-water example",text:"A smooth water surface often directs incoming radar energy away from the sensor and can look dark. Wind or other surface roughness can change that.",note:"This is a qualitative teaching illustration—not an HH/HV prediction."};
  if(water>=50&&vegetation>=40)
    return {title:"Water beneath vegetation can be complex",text:"Water and upright stems can produce double-bounce returns under some geometries. A watery wetland is not always dark in a radar image.",note:"Actual responses depend on radar wavelength, polarization, geometry, and vegetation structure."};
  if(vegetation>=65)
    return {title:"Dense vegetation scatters radar in multiple ways",text:"Branches, trunks, leaves, and ground contribute different interactions. More vegetation does not always mean brighter pixels.",note:"Moisture and acquisition geometry can be as important as density."};
  if(roughness>=65)
    return {title:"Roughness can change the scattered response",text:"An uneven surface may scatter more energy back toward the radar than a smooth surface, depending on scale and incidence angle.",note:"Roughness alone cannot determine a measured backscatter value."};
  return {title:"Several surface factors interact",text:"Radar brightness can respond to moisture, roughness, vegetation, and observing geometry at the same time.",note:"You need actual products and context to quantify a change."};
}
function SurfaceSketch({settings}:{settings:Controls}){
  const {water,vegetation,roughness}=settings;
  const trees=Math.round(vegetation/5);
  const pebbles=Math.round(roughness/4);
  return <svg className="playground-surface-sketch" viewBox="0 0 640 340" role="img"
    aria-label={"Conceptual overhead landscape. Water "+category(water)+", vegetation "+category(vegetation)+", roughness "+category(roughness)}>
    <defs>
      <linearGradient id="sketch-ground" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#30453b"/><stop offset="1" stopColor="#1a2e2b"/></linearGradient>
      <linearGradient id="sketch-water" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#176f80"/><stop offset="1" stopColor="#14414e"/></linearGradient>
    </defs>
    <rect width="640" height="340" fill="url(#sketch-ground)"/>
    <path d="M-30 102 C85 -10 225 220 320 94 S525 -15 665 105 L665 340 L-30 340Z"
      fill="url(#sketch-water)" opacity={water/115}/>
    {Array.from({length:pebbles},(_,i)=>{
      const x=31+((i*163)%592),y=18+((i*101)%310);
      return <path key={"rock-"+i} d={"M"+x+" "+y+" l"+(6+i%8)+" -3 l7 6 z"} fill="#9aada2" opacity=".46"/>;
    })}
    {Array.from({length:trees},(_,i)=>{
      const x=37+((i*173)%560),y=32+((i*79)%273),r=9+((i*13)%11);
      return <g key={"tree-"+i} transform={"translate("+x+" "+y+")"}>
        <ellipse cy="4" rx={r+5} ry={r*.7} fill="#051e1b" opacity=".4"/>
        <circle cy="-4" r={r} fill={i%2?"#518a64":"#376c54"} stroke="#8acba0" strokeWidth="1.1"/>
        <path d={"M"+(-r/2)+" -6 Q0 "+(-r*1.5)+" "+(r/2)+" -6"} fill="none" stroke="#a0dcaa" opacity=".45"/>
      </g>;
    })}
    <rect x="15" y="15" width="204" height="31" rx="5" fill="#071920" opacity=".84"/>
    <text x="26" y="35" fill="#c9efe7" fontSize="12" fontFamily="sans-serif">SURFACE SCHEMATIC · NOT SAR</text>
    <rect x="432" y="286" width="190" height="37" rx="5" fill="#081923" opacity=".9"/>
    <text x="444" y="310" fill="#c1dedc" fontSize="11" fontFamily="sans-serif">Illustration · no measurements</text>
  </svg>;
}

export function RadarPlayground(){
  const [settings,setSettings]=useState<Controls>(presets[0].controls);
  const [preset,setPreset]=useState("Wetland");
  const explanation=getExplanation(settings);
  function change<K extends keyof Controls>(key:K,value:number){
    setSettings(old=>({...old,[key]:value}));setPreset("Custom");
  }
  return <CompetitionShell><main className="minimal-playground-page">
    <div className="minimal-crumbs"><a href={siteHref("/")}>Home</a><span>/</span><a href={siteHref("/learn/")}>Learn</a><span>/</span> Radar Playground</div>
    <div className="minimal-playground-header">
      <div>
        <p className="hub-kicker"><SlidersHorizontal size={15}/> INTERACTIVE SCIENCE / EDUCATIONAL SIMULATION</p>
        <h1>Radar Playground</h1>
        <p>Change the landscape. Discover why radar signals can be hard to interpret.</p>
      </div>
      <a className="minimal-primary-link" href={siteHref("/explore/")}>Explore the radar map <ArrowRight size={16}/></a>
    </div>
    <div className="playground-mode-warning"><TriangleAlert size={17}/><span><strong>Concept only.</strong> These controls change an educational surface drawing. They do not generate scientifically calibrated radar images, predict dB values, or use NISAR observations.</span></div>
    <div className="playground-preset-row" role="group" aria-label="Choose example landscape">
      {presets.map(p=><button type="button" key={p.name} aria-pressed={preset===p.name} className={preset===p.name?"selected":""} onClick={()=>{setPreset(p.name);setSettings({...p.controls});}}>{p.name}</button>)}
      <button type="button" className="playground-reset" onClick={()=>{setSettings({...presets[0].controls});setPreset("Wetland");}}><RefreshCcw size={14}/> Reset</button>
    </div>
    <div className="playground-workspace">
      <section className="playground-scene" aria-label="Conceptual surface visualization">
        <SurfaceSketch settings={settings}/>
        <div className="playground-scene-footer">
          <span>ILLUSTRATIVE LANDSCAPE</span><span>{preset} · top-down schematic</span>
        </div>
      </section>
      <aside className="playground-controls" aria-label="Adjust illustrative surface conditions">
        <h2>Change the surface</h2>
        <p>Adjust one variable at a time, then see how the explanation changes.</p>
        {([
          {id:"water",title:"Water coverage",icon:Droplets,help:"Smooth water can appear dark; vegetation can change that."},
          {id:"vegetation",title:"Vegetation density",icon:Trees,help:"Leaves, branches and trunks affect the returned signal."},
          {id:"roughness",title:"Surface roughness",icon:Mountain,help:"Small-scale texture influences radar scattering."}
        ] as const).map(item=><div key={item.id} className="playground-control">
          <label htmlFor={"playground-"+item.id}><item.icon size={16}/>{item.title}<output>{category(settings[item.id])}</output></label>
          <input id={"playground-"+item.id} type="range" min="0" max="100" step="5" value={settings[item.id]}
            onChange={event=>change(item.id,Number(event.target.value))}/>
          <p>{item.help}</p>
        </div>)}
      </aside>
    </div>
    <section className="playground-explanation" aria-live="polite">
      <div className="playground-explanation-label"><Compass size={18}/> WHAT WOULD A RADAR INVESTIGATOR ASK?</div>
      <h2>{explanation.title}</h2>
      <p>{explanation.text}</p>
      <small>{explanation.note}</small>
    </section>
    <div className="minimal-next-pages">
      <a href={siteHref("/hypotheses/")}><BookOpen size={18}/><span><strong>Test explanations</strong><small>Open Hypothesis Lab</small></span><ArrowRight size={16}/></a>
      <a href={siteHref("/mission/")}><Compass size={18}/><span><strong>Try a guided mission</strong><small>Practice making a careful observation</small></span><ArrowRight size={16}/></a>
    </div>
  </main></CompetitionShell>;
}
