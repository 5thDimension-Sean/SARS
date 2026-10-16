/** Pinned MapLibre v5 browser bundle. External CDN allows the existing static-export
 * build and lockfile to remain unchanged; the map needs internet at runtime.
 * We show an explicit error on blocked CDN/WebGL rather than mislabel a placeholder a map.
 */
export type MapPoint = {lng:number;lat:number};
export interface MapInstance {
  on(event:string, listener:(event:{lngLat:MapPoint})=>void):void;
  off(event:string,listener:(event:{lngLat:MapPoint})=>void):void;
  addControl(control:unknown,position?:string):void;
  addSource(id:string,source:object):void;
  getSource(id:string):{setData?:(data:object)=>void;updateImage?:(options:object)=>void}|undefined;
  addLayer(layer:object):void;
  getLayer(id:string):unknown;
  setLayoutProperty(layer:string,name:string,value:unknown):void;
  setPaintProperty(layer:string,name:string,value:unknown):void;
  flyTo(options:object):void;
  fitBounds(bounds:[[number,number],[number,number]],options:object):void;
  getCanvas():HTMLCanvasElement;
  remove():void;
}
export interface MapLibreBrowser {
  Map:new(options:object)=>MapInstance;
  NavigationControl:new(options?:object)=>unknown;
}
declare global {
  interface Window {maplibregl?:MapLibreBrowser}
}
let pending:Promise<MapLibreBrowser>|null=null;
const version="5.12.0";
export function loadMapLibre():Promise<MapLibreBrowser>{
  if(typeof window==="undefined")return Promise.reject(new Error("Map needs a browser."));
  if(window.maplibregl)return Promise.resolve(window.maplibregl);
  if(pending)return pending;
  pending=new Promise<MapLibreBrowser>((resolve,reject)=>{
    if(!document.getElementById("sar-maplibre-css")){
      const link=document.createElement("link");
      link.id="sar-maplibre-css";link.rel="stylesheet";
      link.href="https://unpkg.com/maplibre-gl@"+version+"/dist/maplibre-gl.css";
      document.head.appendChild(link);
    }
    const script=document.createElement("script");
    script.src="https://unpkg.com/maplibre-gl@"+version+"/dist/maplibre-gl.js";
    script.async=true;
    script.onload=()=>window.maplibregl?resolve(window.maplibregl):reject(new Error("MapLibre bundle did not initialize."));
    script.onerror=()=>reject(new Error("MapLibre could not load. Check network access or CDN restrictions."));
    document.head.appendChild(script);
  }).catch(error=>{pending=null;throw error;});
  return pending!;
}
