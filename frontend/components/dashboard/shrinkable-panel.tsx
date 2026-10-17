"use client";
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from "react";
import {shrinkPanel,type PanelSize,type PanelEdge,type PanelLimits} from "@/lib/interaction-geometry";

const edges:PanelEdge[]=["n","e","s","w","ne","se","sw","nw"];
const names:Record<PanelEdge,string>={n:"top",e:"right",s:"bottom",w:"left",ne:"top-right corner",se:"bottom-right corner",sw:"bottom-left corner",nw:"top-left corner"};
type Drag={edge:PanelEdge,x:number,y:number,start:PanelSize};

export function ShrinkablePanel({children,className="",minWidth=150,minHeight=180}:{
  children:ReactNode;className?:string;minWidth?:number;minHeight?:number;
}){
  const node=useRef<HTMLDivElement>(null);
  const drag=useRef<Drag|null>(null);
  const original=useRef<PanelLimits|null>(null);
  const [size,setSize]=useState<PanelSize|null>(null);
  const [active,setActive]=useState(false);

  useEffect(()=>{
    // Capture the default dimensions once. Neither axis can ever exceed these limits.
    const frame=window.requestAnimationFrame(()=>{
      if(!node.current)return;
      const box=node.current.getBoundingClientRect();
      if(box.width<40||box.height<40)return;
      const max={width:box.width,height:box.height};
      original.current=max;
      setSize({width:max.width,height:max.height,left:0,top:0});
    });
    return()=>window.cancelAnimationFrame(frame);
  },[]);

  function startDrag(event:ReactPointerEvent<HTMLDivElement>,edge:PanelEdge){
    if(event.button!==0||!size||!original.current)return;
    event.preventDefault();event.stopPropagation();
    drag.current={edge,x:event.clientX,y:event.clientY,start:size};
    setActive(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current||!original.current)return;
    const {edge,x,y,start}=drag.current;
    setSize(shrinkPanel(start,edge,event.clientX-x,event.clientY-y,
      original.current,{width:minWidth,height:minHeight}));
  }
  function stopDrag(event:ReactPointerEvent<HTMLDivElement>){
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current=null;setActive(false);
  }
  function restore(){
    if(!original.current)return;
    setSize({...original.current,left:0,top:0});
  }
  function onKey(event:ReactKeyboardEvent<HTMLDivElement>,edge:PanelEdge){
    if(!size||!original.current)return;
    if(event.key==="Home"){event.preventDefault();restore();return;}
    const dx=event.key==="ArrowRight"?12:event.key==="ArrowLeft"?-12:0;
    const dy=event.key==="ArrowDown"?12:event.key==="ArrowUp"?-12:0;
    if(dx===0&&dy===0)return;
    event.preventDefault();
    setSize(shrinkPanel(size,edge,dx,dy,original.current,{width:minWidth,height:minHeight}));
  }
  const style:CSSProperties=size?{
    width:size.width,height:size.height,marginLeft:size.left,marginTop:size.top,
    maxWidth:"100%",maxHeight:"100%"
  }:{width:"100%",height:"100%"};
  return <div ref={node} className={"shrinkable-panel "+className+(active?" is-resizing":"")} style={style}>
    <div className="shrinkable-panel-content">{children}</div>
    {edges.map(edge=><div key={edge} className={"panel-resize-edge edge-"+edge}
      role="separator" aria-label={"Resize panel from "+names[edge]+"; drag inward to shrink, double-click to restore"}
      aria-orientation={edge==="e"||edge==="w"?"vertical":"horizontal"}
      tabIndex={0} title={"Drag "+names[edge]+" to shrink; double-click to restore"}
      onPointerDown={event=>startDrag(event,edge)}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onDoubleClick={restore}
      onKeyDown={event=>onKey(event,edge)}/>)}
  </div>;
}
