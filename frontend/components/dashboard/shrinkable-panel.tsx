"use client";
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from "react";
import {shrinkPanel,type PanelSize,type PanelEdge,type PanelLimits} from "@/lib/interaction-geometry";

const edges:PanelEdge[]=["n","e","s","w","ne","se","sw","nw"];
const names:Record<PanelEdge,string>={n:"top",e:"right",s:"bottom",w:"left",ne:"top-right corner",se:"bottom-right corner",sw:"bottom-left corner",nw:"top-left corner"};
type Drag={edge:PanelEdge;x:number;y:number;start:PanelSize};

export function ShrinkablePanel({
  children,className="",minWidth=150,minHeight=180,onWidthChange,
  fillAvailableWidth=false,fillVersion=0,dockToGrid=false,anchorBottom,anchorLeft=0
}:{
  children:ReactNode;
  className?:string;
  minWidth?:number;
  minHeight?:number;
  onWidthChange?:(width:number)=>void;
  /** Central map fills the remaining track unless the user directly shrinks it. */
  fillAvailableWidth?:boolean;
  /** Another column changed: release a manual map-width constraint. */
  fillVersion?:number;
  /** Sidebars stay flush with their tracks so the map gains all released space. */
  dockToGrid?:boolean;
  /** Floating overlays use original-position coordinates to support any edge. */
  anchorBottom?:number;
  anchorLeft?:number;
}){
  const node=useRef<HTMLDivElement>(null);
  const drag=useRef<Drag|null>(null);
  const original=useRef<PanelLimits|null>(null);
  const [size,setSize]=useState<PanelSize|null>(null);
  const [active,setActive]=useState(false);
  const [manualWidth,setManualWidth]=useState(false);

  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      const el=node.current;
      if(!el)return;
      const box=el.getBoundingClientRect();
      if(box.width<40||box.height<40)return;
      const max={width:box.width,height:box.height};
      original.current=max;
      setSize({width:max.width,height:max.height,left:0,top:0});
    });
    return()=>window.cancelAnimationFrame(frame);
  },[]);

  // An expanded map should fill the extra width released by a sidebar.
  // We do not remount its image, preserving the selected dates and zoom.
  useEffect(()=>{
    if(fillAvailableWidth)setManualWidth(false);
  },[fillAvailableWidth,fillVersion]);

  function apply(next:PanelSize,previous:PanelSize,edge:PanelEdge){
    setSize(next);
    if(fillAvailableWidth&&(edge.includes("e")||edge.includes("w")))setManualWidth(true);
    if(onWidthChange&&Math.round(next.width)!==Math.round(previous.width))onWidthChange(next.width);
  }
  function startDrag(event:ReactPointerEvent<HTMLDivElement>,edge:PanelEdge){
    if(event.button!==0||!size||!original.current)return;
    event.preventDefault();event.stopPropagation();
    const bounds=node.current?.getBoundingClientRect();
    if(!bounds)return;
    const start=fillAvailableWidth&&!manualWidth
      ? {...size,width:bounds.width,left:0}
      :size;
    if(fillAvailableWidth){
      original.current.width=Math.max(original.current.width,bounds.width);
    }
    drag.current={edge,x:event.clientX,y:event.clientY,start};
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||!original.current)return;
    const {edge,x,y,start}=drag.current;
    apply(shrinkPanel(start,edge,event.clientX-x,event.clientY-y,
      original.current,{width:minWidth,height:minHeight}),start,edge);
  }
  function stopDrag(event:ReactPointerEvent<HTMLDivElement>){
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current=null;setActive(false);
  }
  function restore(){
    if(!original.current)return;
    const next={...original.current,left:0,top:0};
    setSize(next);
    if(fillAvailableWidth)setManualWidth(false);
    onWidthChange?.(next.width);
  }
  function onKey(event:ReactKeyboardEvent<HTMLDivElement>,edge:PanelEdge){
    if(!size||!original.current)return;
    if(event.key==="Home"){event.preventDefault();restore();return;}
    const dx=event.key==="ArrowRight"?12:event.key==="ArrowLeft"?-12:0;
    const dy=event.key==="ArrowDown"?12:event.key==="ArrowUp"?-12:0;
    if(dx===0&&dy===0)return;
    event.preventDefault();
    const current=fillAvailableWidth&&!manualWidth&&node.current
      ? {...size,width:node.current.getBoundingClientRect().width,left:0}
      :size;
    if(fillAvailableWidth)original.current.width=Math.max(original.current.width,current.width);
    apply(shrinkPanel(current,edge,dx,dy,original.current,{width:minWidth,height:minHeight}),current,edge);
  }

  let style:CSSProperties;
  if(anchorBottom!==undefined){
    style=size&&original.current
      ? {position:"absolute",width:size.width,height:size.height,
         left:anchorLeft+size.left,
         bottom:anchorBottom+original.current.height-size.top-size.height,
         right:"auto",top:"auto",maxWidth:"calc(100% - 44px)",maxHeight:"calc(100% - 40px)"}
      : {position:"absolute",left:anchorLeft,right:anchorLeft,bottom:anchorBottom,
         width:"auto",height:"auto",maxWidth:"calc(100% - 44px)"};
  }else{
    style=size
      ? {width:fillAvailableWidth&&!manualWidth?"100%":size.width,
         height:size.height,marginLeft:dockToGrid?0:size.left,marginTop:size.top,
         maxWidth:"100%",maxHeight:"100%"}
      : {width:"100%",height:"100%"};
  }
  return <div ref={node} className={"shrinkable-panel "+className+(active?" is-resizing":"")} style={style}>
    <div className="shrinkable-panel-content">{children}</div>
    {edges.map(edge=><div key={edge} className={"panel-resize-edge edge-"+edge}
      role="separator" aria-label={"Resize panel from "+names[edge]+"; drag inward to shrink, double-click to restore"}
      aria-orientation={edge==="e"||edge==="w"?"vertical":"horizontal"}
      tabIndex={0} title={"Drag "+names[edge]+" to shrink; double-click to restore"}
      onPointerDown={event=>startDrag(event,edge)}
      onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}
      onDoubleClick={restore} onKeyDown={event=>onKey(event,edge)}/>)}
  </div>;
}
