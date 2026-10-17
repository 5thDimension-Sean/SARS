"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Plus,
  Minus,
  Crosshair,
  Maximize,
  Minimize,
  MoveHorizontal,
  Layers,
} from "lucide-react";
import { AccessibleSlider } from "./accessible-slider";
import { ProceduralSurface } from "./procedural-surface";
import { RasterSurface } from "./raster-surface";
import type {
  Acquisition,
  Hotspot,
  Phenomenon,
  LayerState,
  Polarization,
} from "@/lib/sample-schema";
import { displayDate, formatCoordinates } from "@/lib/dashboard-utils";
import {clampMapPan} from "@/lib/interaction-geometry";
import {ShrinkablePanel} from "./shrinkable-panel";
/** Replace this component with a map engine; the dashboard only depends on this contract. */
export interface ObservationViewportProps {
  phenomenon: Phenomenon;
  location: Hotspot;
  before: Acquisition;
  after: Acquisition;
  layers: LayerState;
  polarization: Polarization;
  viewMode: "displacement" | "phase";
  children?: React.ReactNode;
}
export function ObservationViewport({
  phenomenon: p,
  location,
  before,
  after,
  layers,
  polarization,
  viewMode,
  children,
}: ObservationViewportProps) {
  const [swipe, setSwipe] = useState(50),
    [zoom, setZoom] = useState(1),
    [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const fullscreenButton=useRef<HTMLButtonElement>(null);
  const drag=useRef<{x:number;y:number;initialX:number;initialY:number}|null>(null);
  const [pan,setPan]=useState({x:0,y:0});
  const [isPanning,setIsPanning]=useState(false);
  useEffect(()=>{
    if(!expanded)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setExpanded(false);}
    };
    window.addEventListener("keydown",onKey);
    root.current?.focus();
    return()=>{
      window.removeEventListener("keydown",onKey);
      window.requestAnimationFrame(()=>fullscreenButton.current?.focus());
    };
  },[expanded]);
  function panDown(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==2||zoom<=1)return;
    event.preventDefault();event.stopPropagation();
    drag.current={x:event.clientX,y:event.clientY,initialX:pan.x,initialY:pan.y};
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function panMove(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag.current)return;
    event.preventDefault();
    const {x,y,initialX,initialY}=drag.current;
    const box=root.current?.getBoundingClientRect();
    if(box)setPan(clampMapPan(initialX+event.clientX-x,initialY+event.clientY-y,zoom,box.width,box.height));
  }
  function panUp(event:ReactPointerEvent<HTMLDivElement>){
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current=null;setIsPanning(false);
  }
  function changeZoom(delta:number){
    const next=Math.max(1,Math.min(3,zoom+delta));
    const box=root.current?.getBoundingClientRect();
    setZoom(next);
    setPan(current=>box?clampMapPan(current.x,current.y,next,box.width,box.height):current);
  }
  const beforeStage = location.acquisitions.findIndex(
      (a) => a.date === before.date,
    ),
    afterStage = location.acquisitions.findIndex((a) => a.date === after.date),
    seismic = p.analysis === "displacement";
  const derived = location.provenance === "derived" && Boolean(location.bounds);
  const changeLayer = location.changeLayers?.find(
    (layer) =>
      layer.type === "dbDiff" &&
      layer.pol === polarization &&
      layer.from === before.date &&
      layer.to === after.date,
  );
  const showDerivedChange = derived && layers.change && Boolean(changeLayer);
  const dbRange = after.dbRanges?.[polarization] ?? [-30, 0];
  const changeRange = location.changeRangeDb ?? [-6, 6];
  const viewport = (
    <div
      className={`map-viewport ${p.id} ${expanded ? "expanded-viewport" : ""} ${isPanning ? "is-panning" : ""}`}
      ref={root}
      tabIndex={expanded?-1:undefined}
      role={expanded?"dialog":undefined}
      aria-modal={expanded?true:undefined}
      aria-label={
        derived
          ? "Georeferenced static GCOV raster preview"
          : "Procedural observation viewport"
      }
    >
      <div className="surface-scene" onContextMenu={event=>event.preventDefault()}
        onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp} onPointerCancel={panUp}>
        <div className="surface-image" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
          {derived ? (
            <RasterSurface
              url={before.layerUrls[polarization]}
              bounds={location.bounds!}
              boundaries={layers.boundaries}
              label={`GCOV ${polarization} backscatter, ${before.date}`}
            />
          ) : (
            <ProceduralSurface
              phenomenon={p.id}
              seed={location.textureSeed}
              stage={beforeStage}
              change={layers.change}
              boundaries={layers.boundaries}
              polarization={polarization}
              viewMode={viewMode}
            />
          )}
        </div>
        <div
          className="surface-after"
          style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}
        >
          <div
            className="surface-image"
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
          >
            {derived ? (
              <RasterSurface
                url={after.layerUrls[polarization]}
                changeUrl={showDerivedChange ? changeLayer?.url : undefined}
                bounds={location.bounds!}
                boundaries={layers.boundaries}
                label={`GCOV ${polarization} backscatter, ${after.date}`}
              />
            ) : (
              <ProceduralSurface
                phenomenon={p.id}
                seed={location.textureSeed}
                stage={afterStage}
                change={layers.change}
                boundaries={layers.boundaries}
                polarization={polarization}
                viewMode={viewMode}
              />
            )}
          </div>
        </div>
      </div>
      <div className="map-shading" />
      {layers.grid && <div className="map-grid" />}
      {!derived && <div className="scan-texture" />}
      <div className="viewport-title">
        <span className="eyebrow">SELECTED AREA · {location.id}</span>
        <h1>{location.label}</h1>
        <p>{location.region}</p>
      </div>
      <div className="map-placeholder-badge">
        {derived
          ? "GEOGRAPHIC RASTER PREVIEW · MAP PLACEHOLDER"
          : "PROCEDURAL VIEWPORT · PLACEHOLDER"}
      </div>
      <div className="comparison-tag before">
        BEFORE <b>{displayDate(before.date, true)}</b>
      </div>
      <div className="comparison-tag after">
        AFTER <b>{displayDate(after.date, true)}</b>
      </div>
      <div className="swipe-line" style={{ left: `${swipe}%` }} />
      <div className="swipe-control">
        <AccessibleSlider
          min={0}
          max={100}
          step={1}
          value={[swipe]}
          onValueChange={(v) => setSwipe(v[0])}
          label="Before and after comparison swipe"
          valueText={`${swipe}% before, ${100 - swipe}% after`}
          className="swipe-slider"
        />
        <div className="swipe-handle" style={{ left: `${swipe}%` }}>
          <MoveHorizontal size={19} aria-hidden />
        </div>
      </div>
      <div className="swipe-hint">DRAG TO COMPARE</div>
      <div className="map-controls" role="group" aria-label="Viewport controls">
        <button
          className="map-control"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => changeZoom(0.25)}
        >
          <Plus size={18} />
        </button>
        <button
          className="map-control"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => changeZoom(-0.25)}
        >
          <Minus size={18} />
        </button>
        <span className="control-divider" />
        <button
          className="map-control"
          aria-label="Recenter viewport"
          onClick={() => {
            setZoom(1);
            setPan({x:0,y:0});
            setSwipe(50);
          }}
        >
          <Crosshair size={18} />
        </button>
        <button
          className="map-control"
          ref={fullscreenButton}
          aria-label={expanded ? "Exit expanded viewport" : "Expand viewport"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>
      <div className="pan-instruction">{zoom>1?"RIGHT-CLICK + DRAG TO PAN":"ZOOM IN TO PAN"}</div>
      <div className="north-marker">
        N<span>▲</span>
      </div>
      <div className="active-layer-label">
        <Layers size={12} />
        {seismic
          ? viewMode === "phase"
            ? "GUNW · WRAPPED PHASE"
            : "GUNW · LOS DISPLACEMENT"
          : `GCOV · ${polarization} BACKSCATTER`}
        {layers.change && (
          <span>
            {derived
              ? showDerivedChange
                ? "+ DERIVED CHANGE"
                : "· NO PRECOMPUTED PAIR"
              : "+ CHANGE"}
          </span>
        )}
      </div>
      <div className="map-legend">
        <div>
          {seismic
            ? viewMode === "phase"
              ? "WRAPPED PHASE · rad"
              : "LOS DISPLACEMENT · cm"
            : derived && !showDerivedChange
              ? `${polarization} BACKSCATTER · dB`
              : "BACKSCATTER CHANGE · dB"}{" "}
          <span>
            {derived ? "DERIVED" : "SAMPLE"}
            {!layers.change && !derived ? " · OFF" : ""}
          </span>
        </div>
        <div
          className={`colorbar ${derived ? (showDerivedChange ? `derived-change ${location.colorMaps?.change ?? "RdBu_r"}` : `derived-backscatter ${location.colorMaps?.backscatter ?? "gray"}`) : seismic ? (viewMode === "phase" ? "phase" : "displacement") : "backscatter"}`}
        />
        <div className="colorbar-labels">
          {seismic ? (
            viewMode === "phase" ? (
              <>
                <span>−π</span>
                <span>0</span>
                <span>+π</span>
              </>
            ) : (
              <>
                <span>−10 away</span>
                <span>0</span>
                <span>+10 toward</span>
              </>
            )
          ) : derived ? (
            <>
              <span>
                {showDerivedChange ? `${changeRange[0]} decrease` : dbRange[0]}
              </span>
              <span>{showDerivedChange ? "0" : "FIXED RANGE"}</span>
              <span>
                {showDerivedChange ? `+${changeRange[1]} increase` : dbRange[1]}
              </span>
            </>
          ) : (
            <>
              <span>−6 decrease</span>
              <span>0</span>
              <span>+6 increase</span>
            </>
          )}
        </div>
      </div>
      <div className="coordinate-readout">
        <Crosshair size={11} />
        {formatCoordinates(
          location.coordinates.latitude,
          location.coordinates.longitude,
        )}
      </div>
      {!derived && (
        <div className="map-scale">
          <span />
          {(5 / zoom).toFixed(1)} km <small>ILLUSTRATIVE</small>
        </div>
      )}
      {children&&<ShrinkablePanel className="timeline-resizable" minWidth={350} minHeight={132} anchorLeft={22} anchorBottom={20}>
        {children}
      </ShrinkablePanel>}
    </div>
  );
  // The surface remains in the same DOM subtree even while fullscreen.
  return viewport;
}
