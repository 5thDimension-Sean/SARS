"use client";
import {useEffect,useMemo,useState} from "react";
import {BookOpen,CheckCircle2,ChevronLeft,ChevronRight,Cloud,Compass,Download,FileText,HelpCircle,Layers3,MapPin,Pause,Play,ScanSearch,ShieldAlert,ShieldCheck,TrendingUp,X} from "lucide-react";
import type {Acquisition,Hotspot,Phenomenon,Polarization} from "@/lib/sample-schema";
import type {InvestigationSnapshot} from "@/lib/investigation-report";
import {calculateRoiComparison,coordinatesAtPoint,evaluateEvidence,radarSeries,reportHtml,validateRoiGrid,type RoiComparison,type SitePoint} from "@/lib/discovery-analysis";
import {siteHref} from "@/components/site-navigation";

type Mode="detect"|"optical"|"evidence"|"waltz"|"report"|"guide";
const sections:{id:Mode;label:string;icon:typeof ScanSearch}[]=[
  {id:"detect",label:"Investigate",icon:ScanSearch},
  {id:"optical",label:"Radar / Optical",icon:Cloud},
  {id:"evidence",label:"Check Evidence",icon:ShieldCheck},
  {id:"waltz",label:"Earth's Waltz",icon:TrendingUp},
  {id:"report",label:"Make a Report",icon:FileText},
  {id:"guide",label:"1-Minute Tour",icon:Compass},
];
const tour=[
  {title:"Choose the place",body:"On the left, pick a location and the type of change you're curious about. Sample scenes are examples, not observed events."},
  {title:"Pick your before and after",body:"In the date bar on the map, pick a reference date and a comparison date. A temporal radar difference needs compatible acquisitions."},
  {title:"Inspect a location",body:"Choose Investigate here, then click anywhere on the map. When processed numerical radar grids are available, the tool reports an approximate local signal difference."},
  {title:"Check what the evidence says",body:"Open Check Evidence to see which requirements pass, what's missing, and why a radar change does not automatically prove a physical cause."},
  {title:"Tell a truthful story",body:"Play the date sequence, read measured signal trends when available, and download a clearly attributed one-page investigation report."},
];

function downloadReport(name:string,contents:string){
  const file=new Blob([contents],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download=name.replace(/[^a-z0-9_-]/gi,"-")+".html";
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function displayDay(date:string){return date.slice(0,10);}
function SignalTimeline({location,polarization,index}:{
  location:Hotspot;polarization:Polarization;index:number
}){
  const series=radarSeries(location,polarization);
  const measured=location.provenance==="derived"&&series.filter(s=>s.value!==null).length>=2;
  const numeric=series.filter((s):s is typeof s & {value:number}=>s.value!==null);
  const lo=Math.min(...numeric.map(x=>x.value),0)-2, hi=Math.max(...numeric.map(x=>x.value),0)+2;
  const points=measured?series.map((s,i)=>s.value===null?null:{
    x:20+i*300/Math.max(1,series.length-1),
    y:90-(s.value-lo)*73/(hi-lo),
    date:s.date,value:s.value
  }):[];
  const line=points.filter((p):p is NonNullable<typeof p>=>p!==null).map(p=>p.x+","+p.y).join(" ");
  return <div className="discovery-trend">
    <div className="discovery-stat-heading">
      <span>{measured?"MEASURED FRAME-WIDE MEAN BACKSCATTER":"ACQUISITION SEQUENCE · DEMO"}</span>
      <span>{polarization}</span>
    </div>
    {measured?<svg viewBox="0 0 340 113" role="img" aria-label="Frame wide measured gamma0 radar time-series; vertical line indicates currently selected date">
      <line x1="20" x2="320" y1="91" y2="91" stroke="#3d6270"/>
      <polyline points={line} fill="none" stroke="#70e0d2" strokeWidth="2.6" strokeLinejoin="round"/>
      {points.map((p,i)=>p&&<circle key={i} cx={p.x} cy={p.y} r={index===i?5:2.6} fill={index===i?"#ffdb91":"#75d7d3"}/>)}
      <line x1={20+index*300/Math.max(1,series.length-1)} x2={20+index*300/Math.max(1,series.length-1)} y1="11" y2="96" stroke="#ffcf82" strokeDasharray="3 4"/>
      <text x="20" y="108" fontSize="10" fill="#9fbdc6">{displayDay(series[0].date)}</text>
      <text x="320" y="108" textAnchor="end" fontSize="10" fill="#9fbdc6">{displayDay(series.at(-1)!.date)}</text>
    </svg>:<div className="discovery-date-dots" aria-label="Available demonstration dates">
      {series.map((s,i)=><span key={i} title={s.date} className={i===index?"selected":""}/>)}
    </div>}
    <p>{measured
      ?"Frame-wide mean radar dB; not a measurement of the selected spot or proof of an event."
      :"Select dates to see the demonstration animate. A measured signal trend will appear when valid GCOV acquisitions and statistics are loaded."}</p>
  </div>;
}

export function DiscoveryLab({
  phenomenon,location,before,after,polarization,index,playing,onPlaying,onIndex,
  selectedPoint,onSelectPoint,showOptical,onShowOptical,onInspectionMode,snapshot
}:{
  phenomenon:Phenomenon;
  location:Hotspot;before:Acquisition;after:Acquisition;polarization:Polarization;
  index:number;playing:boolean;onPlaying:(v:boolean)=>void;onIndex:(n:number)=>void;
  selectedPoint:SitePoint|null;onSelectPoint:(p:SitePoint|null)=>void;
  showOptical:boolean;onShowOptical:(v:boolean)=>void;onInspectionMode:(v:boolean)=>void;snapshot:InvestigationSnapshot;
}){
  const [active,setActive]=useState<Mode|null>(null);
  const [tourStep,setTourStep]=useState(0);
  const [roi,setRoi]=useState<RoiComparison|null>(null);
  const [roiState,setRoiState]=useState<"idle"|"loading"|"missing"|"ready"|"error">("idle");
  const [roiError,setRoiError]=useState("");
  const derived=location.provenance==="derived"&&before.provenance==="derived"&&after.provenance==="derived";
  const optical=derived?after.optical:undefined;
  const checklist=useMemo(()=>evaluateEvidence(location,before,after,polarization),[location,before,after,polarization]);
  const valid=checklist.filter(row=>row.passed).length;
  const region=selectedPoint?coordinatesAtPoint(location,selectedPoint):null;
  const pickX=selectedPoint?.x,pickY=selectedPoint?.y;
  const firstUrl=before.roiGridUrls?.[polarization],secondUrl=after.roiGridUrls?.[polarization];
  // A separate request is started only when an actual location is picked.
  useEffect(()=>{
    if(pickX===undefined||pickY===undefined){
      setRoi(null);setRoiState("idle");return;
    }
    if(!derived||!firstUrl||!secondUrl||before.date===after.date){
      setRoi(null);setRoiState("missing");return;
    }
    const abort=new AbortController();
    setRoi(null);setRoiError("");setRoiState("loading");
    Promise.all([fetch(firstUrl,{signal:abort.signal}),fetch(secondUrl,{signal:abort.signal})])
      .then(async response=>{
        if(response.some(x=>!x.ok))throw new Error("An observation grid is missing. Reprocess the acquisition pair.");
        return Promise.all(response.map(x=>x.json()));
      })
      .then(data=>{
        if(abort.signal.aborted)return;
        const a=validateRoiGrid(data[0],before,polarization);
        const b=validateRoiGrid(data[1],after,polarization);
        setRoi(calculateRoiComparison(a,b,{x:pickX,y:pickY},3));
        setRoiState("ready");
      })
      .catch(error=>{
        if(abort.signal.aborted)return;
        setRoi(null);setRoiState("error");setRoiError(error instanceof Error?error.message:"Radar grid could not be loaded.");
      });
    return()=>abort.abort();
  },[before,after,polarization,pickX,pickY,firstUrl,secondUrl,derived]);
  function switchTab(tab:Mode){
    const next=active===tab?null:tab;
    setActive(next);
    onInspectionMode(next==="detect");
    // Keep the point across tools so it remains in the Evidence and Report views.
    if(tab!=="optical")onShowOptical(false);
    if(tab==="detect"&&active!=="detect")onShowOptical(false);
  }
  const sampleNote=!derived?"Sample mode: imagery, dates, and events are fictional. No real change is being claimed.":null;
  const reportText=[
    snapshot.report,
    "",
    "DISCOVERY LAB",
    "Study: "+phenomenon.label,
    "Selected location: "+(region??"No point selected"),
    "Local overview-grid measurement: "+(roi&&derived
      ?roi.beforeMean.toFixed(3)+" dB (before); "+roi.afterMean.toFixed(3)+" dB (after); "+roi.delta.toFixed(3)+" dB (later minus earlier), "+roi.pairs+" matched pixels."
      :"Unavailable — no validated local numerical comparison."),
    "Evidence checks: "+valid+" of "+checklist.length+" checks passed. This is a checklist, not a confidence score.",
    ...checklist.map(item=>(item.passed?"PASS":"REVIEW")+" "+item.label+": "+item.detail),
    "Optical reference: "+(optical?optical.source+"; "+optical.date+"; "+optical.credit:"Not provided."),
    "Timeline: "+location.acquisitions.length+" acquisitions; "+(derived?"processed GCOV":"fictional samples"),
    "Manual verification of physical change and independent reference evidence remains outstanding."
  ].join("\n");
  return <section className="discovery-lab" aria-label="Discovery Lab tools">
    <div className="discovery-lab-top">
      <div className="discovery-lab-intro"><Layers3 size={16} aria-hidden="true"/><span>DISCOVERY LAB</span></div>
      <div className="discovery-lab-tabs" role="group" aria-label="Choose a discovery tool">
        {sections.map(({id,label,icon:Icon})=><button type="button" key={id} className={active===id?"active":""}
          aria-expanded={active===id} aria-label={label} onClick={()=>switchTab(id)}>
          <Icon size={15} aria-hidden="true"/><span>{label}</span>
        </button>)}
      </div>
      <span className="discovery-lab-status">{derived?"GCOV DATA":"DEMO ONLY"}</span>
    </div>
    {active!==null&&<div className="discovery-lab-drawer" role="region" aria-label={sections.find(s=>s.id===active)?.label}>
      <div className="discovery-drawer-header">
        <div><span className="discovery-eyebrow">SAR-WALTZ / {active.toUpperCase()}</span><h3>{sections.find(s=>s.id===active)?.label}</h3></div>
        <button type="button" onClick={()=>{setActive(null);onShowOptical(false);onInspectionMode(false)}} aria-label="Close Discovery Lab panel"><X size={18}/></button>
      </div>
      {sampleNote&&<p className="discovery-notice"><ShieldAlert size={14}/>{sampleNote}</p>}
      {active==="detect"&&<div className="discovery-pane">
        <p className="discovery-guide-text"><MapPin size={15}/> <strong>Click the map</strong> to mark a place. Right-click and drag still pans while zoomed in.</p>
        {region?<div className="discovery-result">
          <span className="discovery-eyebrow">SELECTED REFERENCE</span><strong>{region}</strong>
          {derived&&roiState==="ready"&&roi?<><div className="discovery-numbers">
              <div>BEFORE<strong>{roi.beforeMean.toFixed(2)} dB</strong></div>
              <div>AFTER<strong>{roi.afterMean.toFixed(2)} dB</strong></div>
              <div>DIFFERENCE<strong>{roi.delta>0?"+":""}{roi.delta.toFixed(2)} dB</strong></div>
            </div><p>{roi.label} ({roi.pairs} matched overview cells). This is an approximate signal change, not a land-area or event classification.</p></>
            :<p>{roiState==="loading"?"Loading measured overview-grid values...":
              roiState==="error"?roiError:
              roiState==="ready"?"Selected cells contain no paired valid measurements.":
              "Local measured dB values will appear when comparable processed GCOV overview grids exist for both dates. Nothing is estimated from illustration colors."}</p>}
        </div>:<div className="discovery-placeholder">No region selected yet. Try clicking the image to place an inspection marker.</div>}
        {selectedPoint&&<button className="discovery-secondary-action" onClick={()=>onSelectPoint(null)}>Clear marker</button>}
      </div>}
      {active==="optical"&&<div className="discovery-pane">
        <p>SAR is sensitive to radar backscatter even in darkness and many cloudy conditions. An optical image shows visible or infrared surface appearance, but clouds may block the view.</p>
        {optical?<><button className="discovery-primary-action" type="button" aria-pressed={showOptical} onClick={()=>onShowOptical(!showOptical)}>
            {showOptical?"Return to radar after-image":"Compare radar against optical"}
          </button><p className="discovery-source">Optical date: {displayDay(optical.date)} · Source: {optical.source} · Credit: {optical.credit}</p>
          <p>Use the map swipe slider to compare radar (left) with the co-registered optical reference (right). The dates may differ.</p></>
          :<div className="discovery-placeholder"><Cloud size={17}/> No verified co-registered optical image has been supplied for this acquisition. Radar-only mode stays active. Add a locally aligned, attributed optical asset in the manifest later.</div>}
      </div>}
      {active==="evidence"&&<div className="discovery-pane">
        <p className="discovery-guide-text"><ShieldCheck size={15}/> Scientific checklist — <strong>{valid}/{checklist.length}</strong> requirements currently met. Not an accuracy score.</p>
        <div className="discovery-checklist">{checklist.map(item=><div key={item.label} className="discovery-check-row">
          {item.passed?<CheckCircle2 color="#76dfbe" size={16}/>:<ShieldAlert color="#efc58d" size={16}/>}
          <div><strong>{item.label}</strong><p>{item.detail}</p></div>
        </div>)}</div>
        <p className="discovery-science-note">Even with all automated checks, physical causes and affected land area require external verification. GCOV does not measure earthquake displacement.</p>
      </div>}
      {active==="waltz"&&<div className="discovery-pane">
        <p>{location.acquisitions.length} acquisition dates. Watch the map and the selected date progress together.</p>
        <SignalTimeline location={location} polarization={polarization} index={index}/>
        <div className="discovery-playback">
          <button type="button" aria-label="Previous date" onClick={()=>onIndex(Math.max(0,index-1))}><ChevronLeft size={16}/> Previous</button>
          <button type="button" aria-label={playing?"Pause the animated sequence":"Play the animated sequence"} onClick={()=>onPlaying(!playing)}>
            {playing?<Pause size={16}/>:<Play size={16}/>} {playing?"Pause":"Play the Waltz"}
          </button>
          <button type="button" aria-label="Next date" onClick={()=>onIndex(Math.min(location.acquisitions.length-1,index+1))}>Next <ChevronRight size={16}/></button>
        </div>
        <p className="discovery-science-note">Missing observations are not interpolated. The timeline is an acquisition sequence, not a continuous recording.</p>
      </div>}
      {active==="report"&&<div className="discovery-pane">
        <p>Turn this investigation into a printable one-page briefing with the selected dates, location, scientific checklist, and radar trend when numeric observations exist.</p>
        <div className="discovery-report-summary">
          <strong>{location.label}</strong><span>{displayDay(before.date)} → {displayDay(after.date)}</span>
          <span>{derived?"DERIVED RADAR · CAUSE UNVERIFIED":"SAMPLE · NOT AN OBSERVED CHANGE"}</span>
        </div>
        <button type="button" className="discovery-primary-action" onClick={()=>downloadReport("sar-waltz-"+location.id,reportHtml(reportText,location.label,radarSeries(location,polarization),derived))}>
          <Download size={16}/> Download printable visual report
        </button>
        <p className="discovery-science-note">Open the downloaded HTML file and use your browser’s Print → Save as PDF. The report never claims a confirmed event.</p>
      </div>}
      {active==="guide"&&<div className="discovery-pane">
        <div className="discovery-tour-progress"><span>STEP {tourStep+1} / {tour.length}</span><div>{tour.map((_,i)=><span key={i} className={i<=tourStep?"filled":""}/>)}</div></div>
        <h4>{tour[tourStep].title}</h4><p>{tour[tourStep].body}</p>
        <div className="discovery-playback">
          <button type="button" disabled={tourStep===0} onClick={()=>setTourStep(v=>Math.max(0,v-1))}><ChevronLeft size={16}/> Back</button>
          <button type="button" onClick={()=>{if(tourStep===tour.length-1){setActive("detect");onInspectionMode(true);setTourStep(0);}else setTourStep(v=>v+1)}}>
            {tourStep===tour.length-1?"Start investigating":"Next step"} <ChevronRight size={16}/>
          </button>
        </div>
        <a className="discovery-help-link" href={siteHref("/learn/")}><BookOpen size={14}/> Learn what radar measures</a>
      </div>}
      <div className="discovery-drawer-footer"><HelpCircle size={13}/> Not yet using live NISAR data? Sample demonstrations stay visibly labeled.</div>
    </div>}
  </section>;
}
