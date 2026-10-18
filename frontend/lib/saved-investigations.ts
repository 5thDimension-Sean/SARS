/** Browser-local bookmarks. No account, server upload or scientific inference.
 * The share link encodes public view parameters, never the user's notes.
 */
export type SavedView = {
  id:string;
  label:string;
  hotspot:string;
  before:string;
  after:string;
  pol:"HH"|"HV";
  point?:{x:number;y:number};
  savedAt:string;
  provenance:"sample"|"derived";
};
export type ViewParams=Omit<SavedView,"id"|"label"|"savedAt">;
export const SAVED_VIEWS_KEY="sar-waltz.saved-views.v1";
export const MAX_SAVED_VIEWS=30;
const dateOK=(d:string)=>/^\d{4}-\d{2}-\d{2}(?:T[\w:.+-]+)?$/.test(d)&&d.length<45;
export function validPoint(p:unknown):p is {x:number;y:number}{
  if(!p||typeof p!=="object")return false;
  const v=p as {x?:unknown;y?:unknown};
  return typeof v.x==="number"&&typeof v.y==="number"&&
    Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=1&&v.y>=0&&v.y<=1;
}
export function parseViewParams(search:string):ViewParams|null {
  const q=new URLSearchParams(search);
  const hotspot=q.get("hotspot"),before=q.get("before"),after=q.get("after"),pol=q.get("pol");
  if(!hotspot||!before||!after||!pol||!/^[-a-zA-Z0-9_]{1,80}$/.test(hotspot)||
     !dateOK(before)||!dateOK(after)||(pol!=="HH"&&pol!=="HV"))return null;
  const x=q.get("x"),y=q.get("y");
  const point=x!==null&&y!==null?{x:Number(x),y:Number(y)}:undefined;
  return {hotspot,before,after,pol,point:validPoint(point)?point:undefined,provenance:q.get("source")==="derived"?"derived":"sample"};
}
export function viewLink(view:ViewParams,basePath=""){
  const q=new URLSearchParams({hotspot:view.hotspot,before:view.before,after:view.after,pol:view.pol});
  if(validPoint(view.point)){
    q.set("x",view.point.x.toFixed(4));q.set("y",view.point.y.toFixed(4));
  }
  if(view.provenance==="derived")q.set("source","derived");
  return basePath+"/explore/?"+q.toString();
}
export function readSavedViews(storage:Pick<Storage,"getItem">):SavedView[]{
  try{
    const raw=storage.getItem(SAVED_VIEWS_KEY);
    if(!raw)return [];
    const parsed:unknown=JSON.parse(raw);
    if(!Array.isArray(parsed))return [];
    return parsed.filter((x):x is SavedView=>{
      if(!x||typeof x!=="object")return false;
      const v=x as Partial<SavedView>;
      return typeof v.id==="string"&&v.id.length<100&&
        typeof v.label==="string"&&v.label.length>0&&v.label.length<140&&
        typeof v.savedAt==="string"&&typeof v.hotspot==="string"&&
        parseViewParams(viewLink(v as ViewParams).split("?")[1])!==null&&
        (v.point===undefined||validPoint(v.point));
    }).slice(0,MAX_SAVED_VIEWS);
  }catch{return [];}
}
export function writeSavedViews(storage:Pick<Storage,"setItem">,views:SavedView[]){
  storage.setItem(SAVED_VIEWS_KEY,JSON.stringify(views.slice(0,MAX_SAVED_VIEWS)));
}
export function addSavedView(storage:Pick<Storage,"getItem"|"setItem">,input:ViewParams,label:string):SavedView[]{
  const current=readSavedViews(storage);
  const saved:SavedView={...input,id:crypto.randomUUID(),label:label.slice(0,139),savedAt:new Date().toISOString()};
  const next=[saved,...current.filter(v=>viewLink(v)!==viewLink(input))].slice(0,MAX_SAVED_VIEWS);
  writeSavedViews(storage,next);
  return next;
}
