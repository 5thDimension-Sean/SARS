"use client";
import {useEffect,useState} from "react";
import {ArrowRight,ArrowUpRight,Bookmark,Check,Clipboard,Database,ExternalLink,MapPin,ShieldAlert,ShieldCheck,Trash2,WifiOff} from "lucide-react";
import {CompetitionShell,siteHref} from "@/components/site-navigation";
import {studySites} from "@/lib/study-sites";
import {adaptPipelineManifest,isSampleManifestSentinel} from "@/lib/manifest-adapter";
import type {Hotspot} from "@/lib/sample-schema";
import {readSavedViews,viewLink,writeSavedViews,type SavedView} from "@/lib/saved-investigations";

type FrameStatus={state:"loading"|"sample"|"processed"|"error";frames:Hotspot[];message:string};
export function DiscoveriesExperience(){
  const [saved,setSaved]=useState<SavedView[]>([]);
  const [dataStatus,setDataStatus]=useState<FrameStatus>({state:"loading",frames:[],message:"Checking the local processed-data manifest..."});
  const [tab,setTab]=useState<"studies"|"saved"|"processed">("studies");
  const [copied,setCopied]=useState<string|null>(null);
  useEffect(()=>{
    try{setSaved(readSavedViews(window.localStorage));}catch{setSaved([]);}
    const refresh=()=>{try{setSaved(readSavedViews(window.localStorage));}catch{setSaved([]);}};
    window.addEventListener("storage",refresh);
    return()=>window.removeEventListener("storage",refresh);
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    async function checkManifest(){
      try{
        const response=await fetch(siteHref("/data/manifest.json"),{signal:abort.signal,cache:"no-cache"});
        if(response.status===404||response.status===204){
          setDataStatus({state:"sample",frames:[],message:"No processed observations have been published yet."});return;
        }
        if(!response.ok)throw Error("Processed dataset could not be loaded (HTTP "+response.status+").");
        const data:unknown=await response.json();
        if(isSampleManifestSentinel(data)){
          setDataStatus({state:"sample",frames:[],message:"No processed observations have been published yet."});return;
        }
        const manifest=adaptPipelineManifest(data);
        setDataStatus({state:"processed",frames:manifest.phenomenon.locations,
          message:"Locally processed GCOV frames are available. They are not independently confirmed surface-change events."});
      }catch(error){
        if(abort.signal.aborted)return;
        setDataStatus({state:"error",frames:[],message:error instanceof Error?error.message:"Processed data manifest could not be verified."});
      }
    }
    void checkManifest();
    return()=>abort.abort();
  },[]);
  function remove(id:string){
    try{
      const next=saved.filter(s=>s.id!==id);
      writeSavedViews(window.localStorage,next);
      setSaved(next);
    }catch{
      setDataStatus(state=>({...state,message:"Browser storage is unavailable; could not remove the bookmark."}));
    }
  }
  async function share(v:SavedView){
    const link=window.location.origin+siteHref(viewLink(v));
    try{await navigator.clipboard.writeText(link);setCopied(v.id);}
    catch{window.prompt("Copy this investigation link:",link);}
  }
  return <CompetitionShell><div className="page-hub">
    <div className="hub-kicker"><Bookmark size={16}/> DISCOVERIES / RETURN TO ANY INVESTIGATION</div>
    <div className="hub-heading">
      <div><h1>Your discovery library.</h1><p>Browse an example, reopen a saved radar view, or inspect processed data when it becomes available. Nothing here is automatically called a confirmed detection.</p></div>
      <a href={siteHref("/mission/")} className="hub-subtle-link">New here? Start a guided mission <ArrowUpRight size={16}/></a>
    </div>
    <div className="discovery-library-tabs" role="group" aria-label="Discovery library sections">
      <button type="button" className={tab==="studies"?"selected":""} aria-pressed={tab==="studies"} onClick={()=>setTab("studies")}><MapPin size={16}/> Explore places <span>5</span></button>
      <button type="button" className={tab==="saved"?"selected":""} aria-pressed={tab==="saved"} onClick={()=>setTab("saved")}><Bookmark size={16}/> Saved views <span>{saved.length}</span></button>
      <button type="button" className={tab==="processed"?"selected":""} aria-pressed={tab==="processed"} onClick={()=>setTab("processed")}><Database size={16}/> Processed data <span>{dataStatus.frames.length}</span></button>
    </div>
    {tab==="studies"&&<div className="discovery-library-grid">{studySites.map((site,i)=><article key={site.hotspotId} className="library-card">
      <div className="library-card-head"><span>0{i+1} / {site.tag}</span><span>SAMPLE INVESTIGATION</span></div>
      <h2>{site.name}</h2><p className="library-card-region">{site.region}</p>
      <p>{site.headline}</p>
      <div className="library-card-action"><a href={siteHref("/studies/"+site.slug+"/")}>Read story <ArrowUpRight size={15}/></a>
        <a href={siteHref("/explore/?hotspot="+encodeURIComponent(site.hotspotId))}>Open in Explore <ArrowRight size={15}/></a></div>
    </article>)}</div>}
    {tab==="saved"&&<section className="hub-panel">
      <div className="hub-panel-head"><h2>Saved investigations</h2><span>Private to this browser</span></div>
      <p className="hub-muted">In Explore, use <strong>Save view</strong> to bookmark the selected area, dates and polarization. Saved views stay in this browser. Shared URLs include only public view settings—not personal notes or files.</p>
      {saved.length? <div className="saved-view-list">{saved.map(v=><article key={v.id} className="saved-view-card">
        <div><span className="hub-kicker">{v.provenance==="sample"?"SAMPLE DEMO":"PROCESSED GCOV · CAUSE NOT VERIFIED"}</span>
          <h3>{v.label}</h3><p>{v.before.slice(0,10)} → {v.after.slice(0,10)} · {v.pol} · Saved {v.savedAt.slice(0,10)}</p></div>
        <div className="saved-view-actions"><a href={siteHref(viewLink(v))}>Open <ExternalLink size={15}/></a>
          <button type="button" onClick={()=>void share(v)}>{copied===v.id?<Check size={15}/>:<Clipboard size={15}/>} {copied===v.id?"Copied":"Copy link"}</button>
          <button type="button" aria-label={"Remove saved view "+v.label} onClick={()=>remove(v.id)}><Trash2 size={15}/></button>
        </div>
      </article>)}</div>:<div className="library-empty"><Bookmark size={24}/><h3>No saved views yet</h3><p>Open a study, choose the dates you care about, and click Save view in the radar workspace.</p><a href={siteHref("/explore/")}>Open Explore <ArrowRight size={16}/></a></div>}
    </section>}
    {tab==="processed"&&<section className="hub-panel">
      <div className="hub-panel-head"><h2>Change Radar · processed scenes</h2><span>REAL PRODUCTS ONLY</span></div>
      <p className="hub-muted">This queue lists processed GCOV frame/date pairs that can be opened for review. It does <strong>not</strong> rank detected changes or identify flooding, tree loss or damage without validated measurements and independent evidence.</p>
      <div className={"data-status-line "+dataStatus.state} role="status">
        {dataStatus.state==="processed"?<ShieldCheck size={17}/>:dataStatus.state==="error"?<ShieldAlert size={17}/>:<WifiOff size={17}/>}
        {dataStatus.message}
      </div>
      {dataStatus.frames.length>0?<div className="saved-view-list">{dataStatus.frames.map(frame=>{
        const count=frame.changeLayers?.filter(x=>x.type==="dbDiff").length??0;
        return <article className="saved-view-card" key={frame.id}>
          <div><span className="hub-kicker">DERIVED GCOV · REVIEW REQUIRED</span><h3>{frame.label}</h3>
            <p>{frame.region} · {frame.acquisitions.length} acquisitions · {count} processed difference overlays</p></div>
          <div className="saved-view-actions"><a href={siteHref("/explore/?hotspot="+encodeURIComponent(frame.id))}>Inspect frame <ArrowUpRight size={15}/></a></div>
        </article>;
      })}</div>:<div className="library-empty"><Database size={24}/><h3>Ready when NASA data arrives</h3>
        <p>Once you process and publish comparable real NISAR GCOV scenes, their frame details appear here automatically. No sample observation is presented as a detection.</p>
        <a href={siteHref("/explore/")}>Explore the sample interface <ArrowRight size={16}/></a>
      </div>}
    </section>}
    <div className="hub-next-strip"><span><ShieldCheck size={16}/> Radar backscatter differences are investigative clues, not proof of an event.</span>
      <a href={siteHref("/hypotheses/")}>Explore explanations <ArrowRight size={16}/></a></div>
  </div></CompetitionShell>;
}
