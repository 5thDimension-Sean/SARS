import type {Acquisition,Hotspot,Polarization} from "./sample-schema";

export type SitePoint={x:number;y:number};
export type RoiGrid={schemaVersion:"1.0";type:"gamma0-db";width:number;height:number;pol:Polarization;date:string;values:(number|null)[]};
export type RoiComparison={beforeMean:number;afterMean:number;delta:number;pairs:number;total:number;label:string};

export function validateRoiGrid(raw:unknown,expected:Acquisition,pol:Polarization):RoiGrid{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("ROI grid is not an object");
  const g=raw as Record<string,unknown>;
  if(g.schemaVersion!=="1.0"||g.type!=="gamma0-db"||g.date!==expected.date||g.pol!==pol)
    throw new Error("ROI grid metadata does not match the selected acquisition and polarization");
  if(!Number.isInteger(g.width)||!Number.isInteger(g.height)||Number(g.width)<8||Number(g.width)>512||Number(g.height)<8||Number(g.height)>512)
    throw new Error("Invalid ROI dimensions");
  const width=Number(g.width),height=Number(g.height);
  if(!Array.isArray(g.values)||g.values.length!==width*height)
    throw new Error("ROI grid sample count does not match its dimensions");
  if(g.values.some(v=>v!==null&&(typeof v!=="number"||!Number.isFinite(v)||v < -180||v > 100)))
    throw new Error("Invalid finite dB values in ROI grid");
  return g as RoiGrid;
}

export function calculateRoiComparison(before:RoiGrid,after:RoiGrid,point:SitePoint,radius=3):RoiComparison|null{
  if(before.width!==after.width||before.height!==after.height||before.pol!==after.pol)
    return null;
  const x=Math.min(before.width-1,Math.max(0,Math.floor(point.x*before.width)));
  const y=Math.min(before.height-1,Math.max(0,Math.floor(point.y*before.height)));
  let total=0,pairs=0,bsum=0,asum=0;
  for(let row=Math.max(0,y-radius);row<=Math.min(before.height-1,y+radius);row++){
    for(let col=Math.max(0,x-radius);col<=Math.min(before.width-1,x+radius);col++){
      if((col-x)**2+(row-y)**2>radius*radius)continue;
      total++;
      const index=row*before.width+col,b=before.values[index],a=after.values[index];
      if(b===null||a===null)continue;
      bsum+=b;asum+=a;pairs++;
    }
  }
  if(!pairs)return null;
  return {beforeMean:bsum/pairs,afterMean:asum/pairs,delta:(asum-bsum)/pairs,pairs,total,
    label:"Approximate overview-grid mean dB within selected neighborhood"};
}

export function radarSeries(location:Hotspot,pol:Polarization){
  return location.acquisitions.map(a=>{
    const metric=a.metrics.find(m=>m.id==="mean-"+pol);
    return {date:a.date,value:metric?.value??null,version:a.productVersion};
  });
}
export type EvidenceStatus={label:string;passed:boolean;detail:string};
export function evaluateEvidence(location:Hotspot,before:Acquisition,after:Acquisition,pol:Polarization):EvidenceStatus[]{
  const derived=location.provenance==="derived"&&before.provenance==="derived"&&after.provenance==="derived";
  const dates=before.date!==after.date;
  const pair=location.changeLayers?.some(l=>l.type==="dbDiff"&&l.from===before.date&&l.to===after.date&&l.pol===pol)===true;
  const sameVersion=before.productVersion===after.productVersion&&before.compositeReleaseId===after.compositeReleaseId&&before.dataMaturity===after.dataMaturity;
  return [
    {label:"Observed radar products",passed:derived,detail:derived?"Derived from the NISAR GCOV pipeline.":"Sample illustrations are not observed measurements."},
    {label:"Two distinct acquisition dates",passed:dates,detail:dates?"Two real timepoints selected.":"Select two different acquisitions."},
    {label:"Matching polarization",passed:before.polarization.includes(pol)&&after.polarization.includes(pol),detail:"Both observations must include the same HH or HV signal."},
    {label:"Comparable processing metadata",passed:sameVersion&&derived,detail:sameVersion?"Product versions, release IDs and maturity match.":"Check calibration and processing differences before interpreting change."},
    {label:"Matched change overlay",passed:derived&&pair,detail:pair?"Precomputed later-minus-earlier dB overlay for this pair.":"No measured temporal difference overlay for this exact pair."},
    {label:"Independent validation",passed:false,detail:"Optical, water-level, field, or authoritative event confirmation must be reviewed by a person."},
  ];
}
export function coordinatesAtPoint(location:Hotspot,p:SitePoint):string{
  if(!location.bounds)return "Illustrative reference only (no georeferenced pixels)";
  const [w,s,e,n]=location.bounds;
  // The image overlay is EPSG:3857; interpolate in projected Y before converting back.
  const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const inv=(y:number)=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
  const lat=inv(merc(n)+(merc(s)-merc(n))*p.y);
  const lon=w+(e-w)*p.x;
  return lat.toFixed(5)+"°, "+lon.toFixed(5)+"°";
}
export function safeHtml(text:string):string{return text.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));}
export function reportHtml(text:string,subject:string):string{
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SAR-Waltz Report</title>'+
    '<style>body{max-width:760px;margin:48px auto;padding:0 20px;font:15px/1.65 Arial;color:#142b35}h1{border-bottom:2px solid #276c76;padding-bottom:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace}small{color:#48626c}@media print{body{margin:20px auto}}</style></head><body>'+
    '<h1>SAR-Waltz · Discovery report</h1><small>'+safeHtml(subject)+'</small><pre>'+safeHtml(text)+'</pre>'+
    '<p><strong>Interpretation warning:</strong> Radar changes are not proof of a physical cause. Verify with external observations.</p></body></html>';
}
