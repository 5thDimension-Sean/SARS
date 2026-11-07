"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { Layers, ChartNoAxesCombined, Satellite } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetHeader,
} from "@/components/ui/sheet";
import { MissionBar } from "./mission-bar";
import { ObservationRail } from "./observation-rail";
import { ObservationViewport } from "./observation-viewport";
import { AnalysisRail } from "./analysis-rail";
import { TimelinePanel } from "./timeline-panel";
import rawData from "@/data/sample-data.json";
import type {
  SampleDataset,
  LayerState,
  Polarization,
} from "@/lib/sample-schema";
import { useDashboardTools } from "@/hooks/use-dashboard-tools";
const data = rawData as SampleDataset;
export function Dashboard() {
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const [phenomenonIndex, setPhenomenon] = useState(0),
    [locationIndex, setLocation] = useState(0),
    [index, setIndex] = useState(6),
    [baseline, setBaseline] = useState(0),
    [layers, setLayers] = useState<LayerState>({
      change: true,
      boundaries: true,
      grid: true,
    }),
    [polarization, setPolarization] = useState<Polarization>("HV"),
    [viewMode, setViewMode] = useState<"displacement" | "phase">(
      "displacement",
    ),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState("1"),
    [collapsed, setCollapsed] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [panelState, setPanelState] = useState<{
      active: "layers" | "analysis" | null;
      last: "layers" | "analysis";
    }>({ active: null, last: "layers" });
  const setMobilePanel = useCallback((active: "layers" | "analysis" | null) => {
    setPanelState((previous) => ({ active, last: active ?? previous.last }));
  }, []);
  const mobilePanel = panelState.active;
  const renderedPanel = mobilePanel ?? panelState.last;
  const p = data.phenomena[phenomenonIndex],
    location = p.locations[locationIndex],
    after = location.acquisitions[index],
    before = location.acquisitions[Math.min(baseline, index)];
  const selectLocation = useCallback((pi: number, li: number) => {
    setPhenomenon(pi);
    setLocation(li);
    setIndex(data.phenomena[pi].locations[li].acquisitions.length - 1);
    setBaseline(0);
    setPlaying(false);
    setMobilePanel(null);
  }, [setMobilePanel]);
  const changeIndex = useCallback((i: number) => {
    setIndex(i);
    setBaseline((b) => Math.min(b, i));
    setPlaying(false);
  }, []);
  useDashboardTools(
    data,
    {
      phenomenon: p.id,
      hotspot: location.id,
      acquisition: after.date,
      baseline: before.date,
      provenance: "sample",
    },
    selectLocation,
  );
  const changePlaying = (v: boolean) => {
    if (v && index === location.acquisitions.length - 1) {
      setIndex(0);
      setBaseline(0);
    }
    setPlaying(v);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setIndex((i) => {
          if (i >= location.acquisitions.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1400 / Number(speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, location.acquisitions.length]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (
        searchOpen ||
        mobilePanel ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input,textarea,select,[role="slider"],[role="tab"],[role="combobox"],[role="listbox"],[contenteditable="true"]',
        )
      )
        return;
      let next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown")
        next = Math.min(index + 1, location.acquisitions.length - 1);
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        next = Math.max(0, index - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = location.acquisitions.length - 1;
      else return;
      event.preventDefault();
      changeIndex(next);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    index,
    changeIndex,
    location.acquisitions.length,
    searchOpen,
    mobilePanel,
  ]);
  const railProps = {
    phenomena: data.phenomena,
    selected: phenomenonIndex,
    locationIndex,
    onPhenomenon: (i: number) => selectLocation(i, 0),
    onLocation: (i: number) => selectLocation(phenomenonIndex, i),
    layers,
    onLayers: setLayers,
  };
  const analysisProps = {
    phenomenon: p,
    location,
    before,
    after,
    polarization,
    onPolarization: setPolarization,
    viewMode,
    onViewMode: setViewMode,
  };
  return (
    <main className="console">
      <a className="skip-link" href="#observation-view">
        Skip to observation viewport
      </a>
      <MissionBar
        acquisition={location.acquisitions.at(-1)!}
        data={data}
        searchOpen={searchOpen}
        onSearchOpen={setSearchOpen}
        onLocation={selectLocation}
      />
      <SidebarProvider
        className={`workspace min-h-0 ${collapsed ? "rail-collapsed" : ""}`}
      >
        <ObservationRail
          {...railProps}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((v) => !v)}
        />
        <section
          className="viewport-column"
          id="observation-view"
          tabIndex={-1}
        >
          <div className="view-heading">
            <div className="eyebrow">
              <span className="view-slash">/</span> EARTH OBSERVATION{" "}
              <span className="view-slash">/</span> {p.shortLabel}
            </div>
            <div className="comparison-mode">
              <span className="cross-dot">◈</span> COMPARISON VIEW
            </div>
            <div className="mobile-panel-buttons">
              <button
                onClick={(e) => {
                  panelTrigger.current = e.currentTarget;
                  setMobilePanel("layers");
                }}
                aria-label="Open observation layers"
              >
                <Layers size={15} />
                <span>Layers</span>
              </button>
              <button
                onClick={(e) => {
                  panelTrigger.current = e.currentTarget;
                  setMobilePanel("analysis");
                }}
                aria-label="Open surface analysis"
              >
                <ChartNoAxesCombined size={15} />
                <span>Analysis</span>
              </button>
            </div>
          </div>
          <ObservationViewport
            key={location.id}
            phenomenon={p}
            location={location}
            before={before}
            after={after}
            layers={layers}
            polarization={polarization}
            viewMode={viewMode}
          >
            <TimelinePanel
              location={location}
              index={index}
              baseline={Math.min(baseline, index)}
              onIndex={changeIndex}
              onBaseline={setBaseline}
              playing={playing}
              onPlaying={changePlaying}
              speed={speed}
              onSpeed={setSpeed}
            />
          </ObservationViewport>
        </section>
        <AnalysisRail {...analysisProps} />
      </SidebarProvider>
      <footer className="system-bar">
        <span>
          <span className="text-cyan">◇</span> SAMPLE MODE{" "}
          <span className="footer-detail">/ NO LIVE DATA</span>
        </span>
        <span>NASA SPACE APPS 2026 · SAR-WALTZ</span>
        <span>
          <Satellite size={11} /> {after.productType} / L-BAND
        </span>
      </footer>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {p.label}, {location.label}, selected acquisition {after.date}, sample
        data.
      </output>
      <Sheet
        open={mobilePanel !== null}
        onOpenChange={(v) => {
          if (!v) setMobilePanel(null);
        }}
      >
        <SheetContent
          side={renderedPanel === "layers" ? "left" : "right"}
          className="mobile-sheet p-0 gap-0"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            panelTrigger.current?.focus();
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {renderedPanel === "layers"
                ? "Observation layers"
                : "Surface analysis"}
            </SheetTitle>
            <SheetDescription>
              Sample dashboard controls. Close to return to the observation
              viewport.
            </SheetDescription>
          </SheetHeader>
          {renderedPanel === "layers" ? (
            <ObservationRail {...railProps} overlay />
          ) : (
            <AnalysisRail {...analysisProps} overlay />
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
