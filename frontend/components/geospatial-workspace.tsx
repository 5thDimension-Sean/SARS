"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowLeft, Download, MapPin, Undo2, Trash2, Layers3, ExternalLink, Save} from "lucide-react";
import rawData from "@/data/sample-data.json";
import type {DashboardDataset,Hotspot,Polarization} from "@/lib/sample-schema";
import {adaptPipelineManifest,isSampleManifestSentinel,withPipelineFrames} from "@/lib/manifest-adapter";
import {loadMapLibre,type MapInstance} from "@/lib/maplibre-loader";
import {annotationDetail,annotationGeoJSON,loadAnnotations,type DrawTool,type GeoAnnotation,type Position} from "@/lib/geo-annotations";
import {siteHref} from "@/components/site-navigation";

const sampleData=rawData as DashboardDataset;
const availableTools: {value:DrawTool;label:string;hint:string}[]=[
  {value:"pan",label:"Navigate",hint:"Move and zoom"},
  {value:"point",label:"Pin",hint:"Place a point"},
  {value:"note",label:"Note",hint:"Add a labeled location"},
  {value:"line",label:"Polyline",hint:"Click vertices, then finish"},
  {value:"measure",label:"Distance",hint:"Measure a path"},
  {value:"polygon",label:"Polygon",hint:"Draw a region"},
  {value:"rectangle",label:"Rectangle",hint:"Click two corners"},
];
const createId=()=>"note-"+Date.now()+"-"+Math.floor(Math.random()*100000);
const empty=()=>({type:"FeatureCollection",features:[]});
type Entry={phenomenon:string;hotspot:Hotspot};
function saveFile(filename:string,data:string,kind:string){
  const url=URL.createObjectURL(new Blob([data],{type:kind}));
  const link=document.createElement("a");
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function GeospatialWorkspace(){
  const [data,setData]=useState<DashboardDataset>(sampleData);
  const [warning,setWarning]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState("W-01");
  const [pol,setPol]=useState<Polarization>("HV");
  const [index,setIndex]=useState(-1);
  const [mode,setMode]=useState<DrawTool>("pan");
  const [draft,setDraft]=useState<Position[]>([]);
  const [annotations,setAnnotations]=useState<GeoAnnotation[]>([]);
  const [basemap,setBasemap]=useState<"dark"|"street">("dark");
  const [opacity,setOpacity]=useState(70);
  const [showRaster,setShowRaster]=useState(true);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [cursor,setCursor]=useState<Position|null>(null);
  const [message,setMessage]=useState("");
  const container=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MapInstance|null>(null);
  const modeRef=useRef<DrawTool>("pan");
  const onCommit=useRef<(kind:GeoAnnotation["kind"],pts:Position[])=>void>(()=>{});
  const all=useMemo<Entry[]>(()=>data.phenomena.flatMap(p=>p.locations.map(l=>({phenomenon:p.label,hotspot:l}))),[data]);
  const entry=all.find(x=>x.hotspot.id===selectedId)??all[0];
  const loc=entry.hotspot;
  const observation=loc.acquisitions[Math.max(0,Math.min(index<0?loc.acquisitions.length-1:index,loc.acquisitions.length-1))];
  const activePol=observation.polarization.includes(pol)?pol:observation.polarization[0];
  const raster=loc.provenance==="derived"?observation.layerUrls[activePol]:null;
  const canFinish=draft.length>=(mode==="polygon"?3:2);

  function commit(kind:GeoAnnotation["kind"],points:Position[]){
    setAnnotations(old=>[...old,{id:createId(),kind,points,label:kind==="note"?"Observation note":kind+" "+(old.length+1)}]);
    setMessage("Unsaved annotations");
  }
  useEffect(()=>{modeRef.current=mode;onCommit.current=commit;});
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const id=params.get("hotspot");
    if(id && sampleData.phenomena.some(p=>p.locations.some(l=>l.id===id)))setSelectedId(id);
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch(siteHref("/data/manifest.json"),{signal:controller.signal,cache:"no-cache"});
        if(response.status===404||response.status===204)return;
        if(!response.ok)throw new Error("Manifest HTTP "+response.status);
        const raw:unknown=await response.json();
        if(isSampleManifestSentinel(raw))return;
        const manifest=adaptPipelineManifest(raw);
        if(!controller.signal.aborted)setData(withPipelineFrames(sampleData,manifest));
      }catch(e){if(!controller.signal.aborted)setWarning(e instanceof Error?e.message:"Manifest invalid");}
    }
    void load();
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    setAnnotations(loadAnnotations(window.localStorage.getItem("sar-waltz-drawings-"+selectedId)));
    setDraft([]);setIndex(-1);setMessage("");
    const url=new URL(window.location.href);
    url.searchParams.set("hotspot",selectedId);
    window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  },[selectedId]);
  useEffect(()=>{
    let closed=false;let current:MapInstance|null=null;
    loadMapLibre().then(lib=>{
      if(closed||!container.current)return;
      const map=new lib.Map({container:container.current,
        style:{version:8,sources:{},layers:[]},
        center:[-80.7031,25.6153],zoom:8,attributionControl:true
      });
      current=map;mapRef.current=map;
      map.addControl(new lib.NavigationControl({visualizePitch:false}),"top-right");
      map.on("load",()=>{
        if(closed)return;
        map.addSource("dark-tiles",{type:"raster",tiles:["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors © CARTO"});
        map.addSource("street-tiles",{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"});
        map.addLayer({id:"dark-map",type:"raster",source:"dark-tiles"});
        map.addLayer({id:"street-map",type:"raster",source:"street-tiles",layout:{visibility:"none"}});
        map.addSource("sar-overlay",{type:"image",url:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",coordinates:[[-81,26],[-80,26],[-80,25],[-81,25]]});
        map.addLayer({id:"sar-raster",type:"raster",source:"sar-overlay",layout:{visibility:"none"},paint:{"raster-opacity":0.7}});
        map.addSource("drawings",{type:"geojson",data:empty()});
        map.addLayer({id:"drawing-fill",type:"fill",source:"drawings",filter:["==",["geometry-type"],"Polygon"],paint:{"fill-color":"#76ece3","fill-opacity":0.17}});
        map.addLayer({id:"drawing-outline",type:"line",source:"drawings",filter:["any",["==",["geometry-type"],"Polygon"],["==",["geometry-type"],"LineString"]],paint:{"line-color":"#9dece8","line-width":3}});
        map.addLayer({id:"drawing-pin",type:"circle",source:"drawings",filter:["==",["geometry-type"],"Point"],paint:{"circle-color":"#f5c995","circle-radius":6,"circle-stroke-width":2,"circle-stroke-color":"#0c1a21"}});
        map.addSource("sites",{type:"geojson",data:empty()});
        map.addLayer({id:"site-dots",type:"circle",source:"sites",paint:{"circle-color":"#6cd5da","circle-radius":5,"circle-stroke-color":"#10212d","circle-stroke-width":2}});
        setReady(true);
      });
      map.on("click",event=>{
        const tool=modeRef.current;
        if(tool==="pan")return;
        const point:Position=[event.lngLat.lng,event.lngLat.lat];
        if(tool==="point"||tool==="note"){onCommit.current(tool,[point]);return;}
        setDraft(previous=>{
          const updated=[...previous,point];
          if(tool==="rectangle"&&updated.length===2){onCommit.current("rectangle",updated);return [];}
          return updated;
        });
      });
      map.on("mousemove",event=>setCursor([event.lngLat.lng,event.lngLat.lat]));
    }).catch(e=>{if(!closed)setError(e instanceof Error?e.message:"Map loading failed");});
    return()=>{closed=true;current?.remove();mapRef.current=null;setReady(false);};
  },[]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    map.getCanvas().style.cursor=mode==="pan"?"grab":"crosshair";
  },[mode,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    map.setLayoutProperty("dark-map","visibility",basemap==="dark"?"visible":"none");
    map.setLayoutProperty("street-map","visibility",basemap==="street"?"visible":"none");
  },[basemap,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    map.getSource("sites")?.setData?.({type:"FeatureCollection",features:all.map(x=>({type:"Feature",properties:{name:x.hotspot.region},geometry:{type:"Point",coordinates:[x.hotspot.coordinates.longitude,x.hotspot.coordinates.latitude]}}))});
  },[all,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    if(loc.bounds)map.fitBounds([[loc.bounds[0],loc.bounds[1]],[loc.bounds[2],loc.bounds[3]]],{padding:70,duration:800,maxZoom:11});
    else map.flyTo({center:[loc.coordinates.longitude,loc.coordinates.latitude],zoom:9,duration:800});
  },[loc,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!ready||!map)return;
    if(raster&&loc.bounds){
      map.getSource("sar-overlay")?.updateImage?.({url:raster,coordinates:[[loc.bounds[0],loc.bounds[3]],[loc.bounds[2],loc.bounds[3]],[loc.bounds[2],loc.bounds[1]],[loc.bounds[0],loc.bounds[1]]]});
    }
    map.setLayoutProperty("sar-raster","visibility",raster&&loc.bounds&&showRaster?"visible":"none");
    map.setPaintProperty("sar-raster","raster-opacity",opacity/100);
  },[ready,raster,loc,showRaster,opacity]);
  useEffect(()=>{
    if(!ready||!mapRef.current)return;
    const temporary:GeoAnnotation[]=draft.length?[{id:"draft",label:"In progress",kind:mode==="polygon"&&draft.length>=3?"polygon":"line",points:draft}]:[];
    mapRef.current.getSource("drawings")?.setData?.(annotationGeoJSON([...annotations,...temporary]));
  },[ready,annotations,draft,mode]);

  function finish(){
    if(!canFinish||!(mode==="polygon"||mode==="line"||mode==="measure"))return;
    commit(mode,[...draft]);setDraft([]);setMode("pan");
  }
  function undo(){
    if(draft.length)setDraft(old=>old.slice(0,-1));
    else{setAnnotations(old=>old.slice(0,-1));setMessage("Unsaved annotations");}
  }
  function save(){
    try{window.localStorage.setItem("sar-waltz-drawings-"+selectedId,JSON.stringify(annotations));setMessage("Saved in this browser");}
    catch{setMessage("Local storage unavailable. Export as GeoJSON.");}
  }
  return <div className="geo-workspace">
    <header className="geo-header">
      <a className="geo-back" href={siteHref("/")}><ArrowLeft size={15}/> SAR-WALTZ</a>
      <div><strong>Geospatial laboratory</strong><small>ANNOTATE · MEASURE · INVESTIGATE</small></div>
      <a className="geo-dashboard-link" href={siteHref("/explore/?hotspot="+encodeURIComponent(loc.id))}>Analysis dashboard <ExternalLink size={14}/></a>
    </header>
    <div className="geo-grid">
      <aside className="geo-rail">
        <p className="geo-label"><MapPin size={15}/> STUDY AREA</p>
        <select aria-label="Choose study location" value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
          {all.map(x=><option key={x.hotspot.id} value={x.hotspot.id}>{x.hotspot.region} · {x.hotspot.label}</option>)}
        </select>
        <p className="geo-source">{loc.provenance==="derived"?"DERIVED GCOV":"SAMPLE SCENE"} · {loc.coordinates.latitude.toFixed(3)}°, {loc.coordinates.longitude.toFixed(3)}°</p>
        <div className="geo-divider"/>
        <p className="geo-label"><Layers3 size={15}/> BASEMAP & IMAGERY</p>
        <label className="geo-field">Map style<select value={basemap} onChange={e=>setBasemap(e.target.value as "dark"|"street")}><option value="dark">Dark geographic map</option><option value="street">Street map</option></select></label>
        <label className="geo-field">Acquisition<select value={Math.max(0,index<0?loc.acquisitions.length-1:index)} onChange={e=>setIndex(Number(e.target.value))}>{loc.acquisitions.map((a,i)=><option key={a.date} value={i}>{a.date.substring(0,10)}</option>)}</select></label>
        <label className="geo-field">Polarization<select value={activePol} onChange={e=>setPol(e.target.value as Polarization)}>{observation.polarization.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
        <label className="geo-toggle"><input type="checkbox" checked={showRaster} onChange={e=>setShowRaster(e.target.checked)}/> Show SAR raster</label>
        <label className="geo-field">Raster opacity · {opacity}%<input type="range" min="0" max="100" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
        <p className="geo-hint">{raster?"Georeferenced processed raster loaded.":"No real raster for this acquisition. Basemap does not represent SAR measurements."}</p>
        <div className="geo-divider"/>
        <p className="geo-label">DRAW & MEASURE</p>
        <div className="geo-tool-grid">{availableTools.map(tool=><button key={tool.value} title={tool.hint} aria-pressed={mode===tool.value} className={mode===tool.value?"active":""} onClick={()=>{setMode(tool.value);setDraft([]);}}>{tool.label}</button>)}</div>
        <p className="geo-hint">{availableTools.find(t=>t.value===mode)?.hint} {mode==="rectangle"?"Two clicks finish the shape.":mode==="polygon"||mode==="measure"||mode==="line"?"Add vertices and click Finish.":""}</p>
        <div className="geo-actions"><button onClick={finish} disabled={!canFinish||mode==="pan"||mode==="point"||mode==="note"||mode==="rectangle"}>Finish shape</button><button onClick={undo} disabled={annotations.length===0&&draft.length===0}><Undo2 size={15}/> Undo</button></div>
        <div className="geo-divider"/>
        <p className="geo-label">ANNOTATIONS · {annotations.length}</p>
        <div className="geo-annotation-list">{annotations.map(a=><div className="geo-annotation-item" key={a.id}><input aria-label={"Rename "+a.kind} value={a.label} maxLength={200} onChange={e=>{setAnnotations(old=>old.map(x=>x.id===a.id?{...x,label:e.target.value}:x));setMessage("Unsaved annotations");}}/><small>{annotationDetail(a)}</small><button aria-label={"Delete "+a.label} onClick={()=>{setAnnotations(old=>old.filter(x=>x.id!==a.id));setMessage("Unsaved annotations");}}><Trash2 size={14}/></button></div>)}</div>
        <div className="geo-actions"><button onClick={save}><Save size={15}/> Save locally</button><button onClick={()=>saveFile("sar-waltz-"+selectedId+".geojson",JSON.stringify(annotationGeoJSON(annotations),null,2),"application/geo+json")}><Download size={15}/> GeoJSON</button></div>
        {message&&<p className="geo-hint" role="status">{message}</p>}
      </aside>
      <section className="geo-main" aria-label="Interactive geospatial map">
        <div className="geo-map-heading"><div><strong>{loc.region}</strong><span>{entry.phenomenon} · {observation.productType} · {loc.provenance==="derived"?"DERIVED":"SAMPLE"}</span></div><span>MAP TOOLS / BETA</span></div>
        <div className="geo-map-shell">
          <div ref={container} className="geo-map-canvas" aria-label="Interactive geographic map"/>
          {!ready&&!error&&<div className="geo-map-notice">Loading interactive map…</div>}
          {error&&<div className="geo-map-notice" role="alert">Interactive map unavailable: {error}. Your existing SAR comparison dashboard is still accessible.</div>}
          <div className="geo-map-status">{cursor?cursor[1].toFixed(4)+"° N/S, "+cursor[0].toFixed(4)+"° E/W":"Move the cursor over the map"} · {mode.toUpperCase()}</div>
        </div>
        <div className="geo-disclaimer">{warning?"Manifest warning: "+warning+" · ":""}Radar imagery appears only for valid processed GCOV frames. Sample hotspot locations and basemap tiles are geographic context, not simulated satellite raster data. Distances/areas are approximate spherical measurements; drawn areas do not yet compute pixel statistics.</div>
      </section>
    </div>
  </div>;
}
