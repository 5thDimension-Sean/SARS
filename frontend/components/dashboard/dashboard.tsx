"use client";
import { useCallback, useEffect, useState, useRef, type CSSProperties } from "react";
import { Layers, ChartNoAxesCombined } from "lucide-react";
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
import {InvestigationGuide} from "./investigation-guide";
import {DiscoveryLab} from "./discovery-lab";
import type {SitePoint} from "@/lib/discovery-analysis";
import {ShrinkablePanel} from "./shrinkable-panel";
import {buildInvestigationSnapshot} from "@/lib/investigation-report";
import rawData from "@/data/sample-data.json";
import type {
  DashboardDataset,
  LayerState,
  Polarization,
} from "@/lib/sample-schema";
import { useDashboardTools } from "@/hooks/use-dashboard-tools";
import {
  adaptPipelineManifest,
  isSampleManifestSentinel,
  withPipelineFrames,
} from "@/lib/manifest-adapter";
const sampleData = rawData as DashboardDataset;
export function Dashboard() {
  const [data, setData] = useState<DashboardDataset>(sampleData);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [selectedPoint,setSelectedPoint]=useState<SitePoint|null>(null);
  const [showOptical,setShowOptical]=useState(false);
  const [inspectionEnabled,setInspectionEnabled]=useState(false);
  const panelTrigger = useRef<HTMLButtonElement | null>(null);
  const [leftWidth,setLeftWidth]=useState<number|null>(null);
  const [rightWidth,setRightWidth]=useState<number|null>(null);
  const [layoutVersion,setLayoutVersion]=useState(0);
  const layoutStyle={
    "--left-pane-width":leftWidth===null?undefined:leftWidth+"px",
    "--right-pane-width":rightWidth===null?undefined:rightWidth+"px",
  } as CSSProperties;
  const [phenomenonIndex, setPhenomenon] = useState(0),
    [locationIndex, setLocation] = useState(0),
    [index, setIndex] = useState(6),
    [baseline, setBaseline] = useState(0),
    [layers, setLayers] = useState<LayerState>({
      change: true,
      boundaries: true,
      grid: false,
    }),
    [polarization, setPolarization] = useState<Polarization>("HV"),
    [viewMode, setViewMode] = useState<"displacement" | "phase">(
      "displacement",
    ),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState("1"),
    [collapsed, setCollapsed] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [mobilePanel, setMobilePanel] = useState<"layers" | "analysis" | null>(
      null,
    );
  const lastMobilePanel = useRef<"layers" | "analysis">("layers");
  useEffect(() => {
    if (mobilePanel) lastMobilePanel.current = mobilePanel;
  }, [mobilePanel]);
  const renderedPanel = mobilePanel ?? lastMobilePanel.current;
  useEffect(() => {
    const controller = new AbortController();
    async function loadManifest() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/manifest.json`, {
          signal: controller.signal,
          cache: "no-cache",
        });
        if (response.status === 404 || response.status === 204) return;
        if (!response.ok)
          throw new Error(
            `Pipeline manifest could not be loaded (HTTP ${response.status}).`,
          );
        const json: unknown = await response.json();
        if (isSampleManifestSentinel(json)) return;
        const manifest = adaptPipelineManifest(json);
        if (controller.signal.aborted) return;
        setData(withPipelineFrames(sampleData, manifest));
        setPhenomenon(0);
        setLocation(0);
        setIndex(manifest.phenomenon.locations[0].acquisitions.length - 1);
        setBaseline(
          Math.max(0, manifest.phenomenon.locations[0].acquisitions.length - 2),
        );
        setPlaying(false);
      } catch (error) {
        if (!controller.signal.aborted)
          setManifestError(
            error instanceof Error
              ? error.message
              : "Pipeline manifest is invalid.",
          );
      }
    }
    void loadManifest();
    return () => controller.abort();
  }, []);
  const p = data.phenomena[phenomenonIndex],
    location = p.locations[locationIndex],
    after = location.acquisitions[index],
    before = location.acquisitions[Math.min(baseline, index)];
  const derived = location.provenance === "derived";
  const activePolarization = after.polarization.includes(polarization)
    ? polarization
    : after.polarization[0];
  const findings=buildInvestigationSnapshot({phenomenon:p,location,before,after,polarization:activePolarization});
  const selectLocation = useCallback(
    (pi: number, li: number) => {
      const selectedLocation = data.phenomena[pi].locations[li];
      setPhenomenon(pi);
      setLocation(li);
      setIndex(selectedLocation.acquisitions.length - 1);
      setBaseline(
        selectedLocation.provenance === "derived"
          ? Math.max(0, selectedLocation.acquisitions.length - 2)
          : 0,
      );
      setPlaying(false);
      setSelectedPoint(null);setShowOptical(false);
      setMobilePanel(null);
    },
    [data],
  );
  // Deep-link from the five study pages. Use only known hotspot IDs from the dataset.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("hotspot");
    if (!requested) return;
    for (let pi = 0; pi < data.phenomena.length; pi++) {
      const li = data.phenomena[pi].locations.findIndex((l) => l.id === requested);
      if (li < 0) continue;
      const chosen = data.phenomena[pi].locations[li];
      setPhenomenon(pi);
      setLocation(li);
      setIndex(chosen.acquisitions.length - 1);
      setBaseline(chosen.provenance === "derived" ? Math.max(0, chosen.acquisitions.length - 2) : 0);
      setPlaying(false);
      break;
    }
  }, [data]);
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
      provenance: derived ? "derived" : "sample",
    },
    selectLocation,
  );
  const comparePreset = (preset: "first" | "previous") => {
    const latest = location.acquisitions.length - 1;
    setIndex(latest);
    setBaseline(preset === "first" ? 0 : Math.max(0, latest - 1));
    setPlaying(false);
  };
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
        event.defaultPrevented ||
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
          'input,textarea,select,[role="slider"],[role="separator"],[role="tab"],[role="combobox"],[role="listbox"],[contenteditable="true"]',
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
    polarization: activePolarization,
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
        provenance={derived ? "derived" : "sample"}
        data={data}
        searchOpen={searchOpen}
        onSearchOpen={setSearchOpen}
        onLocation={selectLocation}
      />
      <SidebarProvider
        className={`workspace min-h-0 ${collapsed ? "rail-collapsed" : ""}`}
        style={layoutStyle}
      >
        <ShrinkablePanel className="workspace-left-pane" minWidth={145} minHeight={280} dockToGrid onWidthChange={width=>{setLeftWidth(width);setLayoutVersion(v=>v+1);}}>
        <ObservationRail
          {...railProps}
          collapsed={collapsed}
          onCollapse={() => setCollapsed((v) => !v)}
        />
        </ShrinkablePanel>
        <ShrinkablePanel className="workspace-center-pane" minWidth={440} minHeight={410} fillAvailableWidth fillVersion={layoutVersion}>
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
          <InvestigationGuide snapshot={findings} hotspotId={location.id} hasMultiple={location.acquisitions.length>1} comparePreset={comparePreset}/>
          <DiscoveryLab phenomenon={p} location={location} before={before} after={after}
            polarization={activePolarization} index={index} playing={playing}
            onPlaying={changePlaying} onIndex={changeIndex}
            selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint}
            showOptical={showOptical} onShowOptical={setShowOptical}
            onInspectionMode={setInspectionEnabled} snapshot={findings}/>
          <ObservationViewport
            key={location.id}
            phenomenon={p}
            location={location}
            before={before}
            after={after}
            layers={layers}
            polarization={activePolarization}
            viewMode={viewMode}
            inspectionEnabled={inspectionEnabled}
            selectedPoint={selectedPoint}
            onSelectPoint={setSelectedPoint}
            showOptical={showOptical}
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
        </ShrinkablePanel>
        <ShrinkablePanel className="workspace-right-pane" minWidth={180} minHeight={290} dockToGrid onWidthChange={width=>{setRightWidth(width);setLayoutVersion(v=>v+1);}}>
          <AnalysisRail {...analysisProps} />
        </ShrinkablePanel>
      </SidebarProvider>
      {manifestError && (
        <div className="manifest-error" role="status">
          <strong>WARN · Pipeline data was not loaded.</strong> {manifestError}{" "}
          Sample data remains available.
        </div>
      )}
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {p.label}, {location.label}, selected acquisition {after.date},{" "}
        {derived ? "derived GCOV" : "sample"} data.
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
              Dashboard controls. Close to return to the observation viewport.
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
