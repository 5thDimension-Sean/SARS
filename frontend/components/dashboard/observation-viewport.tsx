"use client";
import { useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProceduralSurface } from "./procedural-surface";
import type {
  Acquisition,
  Hotspot,
  Phenomenon,
  LayerState,
  Polarization,
} from "@/lib/sample-schema";
import { displayDate, formatCoordinates } from "@/lib/dashboard-utils";
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
  const beforeStage = location.acquisitions.findIndex(
      (a) => a.date === before.date,
    ),
    afterStage = location.acquisitions.findIndex((a) => a.date === after.date),
    seismic = p.analysis === "displacement";
  const viewport = (
    <div
      className={`map-viewport ${p.id} ${expanded ? "expanded-viewport" : ""}`}
      ref={root}
      aria-label="Procedural observation viewport"
    >
      <div className="surface-scene">
        <div className="surface-image" style={{ transform: `scale(${zoom})` }}>
          <ProceduralSurface
            phenomenon={p.id}
            seed={location.textureSeed}
            stage={beforeStage}
            change={layers.change}
            boundaries={layers.boundaries}
            polarization={polarization}
            viewMode={viewMode}
          />
        </div>
        <div
          className="surface-after"
          style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}
        >
          <div
            className="surface-image"
            style={{ transform: `scale(${zoom})` }}
          >
            <ProceduralSurface
              phenomenon={p.id}
              seed={location.textureSeed}
              stage={afterStage}
              change={layers.change}
              boundaries={layers.boundaries}
              polarization={polarization}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
      <div className="map-shading" />
      {layers.grid && <div className="map-grid" />}
      <div className="scan-texture" />
      <div className="viewport-title">
        <span className="eyebrow">SELECTED AREA · {location.id}</span>
        <h1>{location.label}</h1>
        <p>{location.region}</p>
      </div>
      <div className="map-placeholder-badge">
        PROCEDURAL VIEWPORT · PLACEHOLDER
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
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          <Plus size={18} />
        </button>
        <button
          className="map-control"
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
        >
          <Minus size={18} />
        </button>
        <span className="control-divider" />
        <button
          className="map-control"
          aria-label="Recenter viewport"
          onClick={() => {
            setZoom(1);
            setSwipe(50);
          }}
        >
          <Crosshair size={18} />
        </button>
        <button
          className="map-control"
          aria-label={expanded ? "Exit expanded viewport" : "Expand viewport"}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
      </div>
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
        {layers.change && <span>+ CHANGE</span>}
      </div>
      <div className="map-legend">
        <div>
          {seismic
            ? viewMode === "phase"
              ? "WRAPPED PHASE · rad"
              : "LOS DISPLACEMENT · cm"
            : "BACKSCATTER CHANGE · dB"}{" "}
          <span>SAMPLE{!layers.change ? " · OFF" : ""}</span>
        </div>
        <div
          className={`colorbar ${seismic ? (viewMode === "phase" ? "phase" : "displacement") : "backscatter"}`}
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
      <div className="map-scale">
        <span />
        {(5 / zoom).toFixed(1)} km <small>ILLUSTRATIVE</small>
      </div>
      {children}
    </div>
  );
  return (
    <Dialog open={expanded} onOpenChange={setExpanded}>
      {expanded ? (
        <DialogContent
          className="expanded-dialog"
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            document
              .querySelector<HTMLButtonElement>(
                '[aria-label="Expand viewport"]',
              )
              ?.focus();
          }}
        >
          <DialogTitle className="sr-only">
            Expanded observation viewport
          </DialogTitle>
          <DialogDescription className="sr-only">
            Illustrative sample comparison, map controls, and timeline. Escape
            returns to the dashboard.
          </DialogDescription>
          {viewport}
        </DialogContent>
      ) : (
        viewport
      )}
    </Dialog>
  );
}
