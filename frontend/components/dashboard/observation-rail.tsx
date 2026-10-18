"use client";
import {
  Waves,
  Activity,
  Trees,
  Crosshair,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Info,
  Satellite,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Sidebar } from "@/components/ui/sidebar";
import type { Phenomenon, LayerState } from "@/lib/sample-schema";
const icons = {
  wetland: Waves,
  earthquake: Activity,
  forest: Trees,
  gcov: Satellite,
};
export function ObservationRail({
  phenomena,
  selected,
  locationIndex,
  onPhenomenon,
  onLocation,
  layers,
  onLayers,
  collapsed = false,
  onCollapse,
  overlay = false,
}: {
  phenomena: Phenomenon[];
  selected: number;
  locationIndex: number;
  onPhenomenon: (i: number) => void;
  onLocation: (i: number) => void;
  layers: LayerState;
  onLayers: (v: LayerState) => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  overlay?: boolean;
}) {
  const p = phenomena[selected];
  const content = (
    <>
      <div className="rail-heading">
        <span className="expanded-content">CHOOSE WHAT TO EXPLORE</span>
        {onCollapse && (
          <button
            className="icon-button"
            onClick={onCollapse}
            aria-label={
              collapsed
                ? "Expand observation rail"
                : "Collapse observation rail"
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        )}
      </div>
      <nav className="phenomena-list" aria-label="Phenomena">
        {phenomena.map((item, i) => {
          const Icon = icons[item.id];
          return (
            <button
              aria-pressed={i === selected}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              key={item.id}
              className={`phenomenon ${i === selected ? "selected" : ""}`}
              onClick={() => onPhenomenon(i)}
            >
              <Icon size={19} aria-hidden />
              <div className="expanded-content">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </div>
              <ChevronRight
                size={14}
                className="expanded-content"
                aria-hidden
              />
            </button>
          );
        })}
      </nav>
      <details className="rail-disclosure expanded-content" defaultOpen>
        <summary className="rail-disclosure-summary">
          <span>{p.id === "gcov" ? "PROCESSED FRAMES" : "PLACES"} <small>{String(p.locations.length).padStart(2, "0")}</small></span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="rail-disclosure-body places-body">
          {p.locations.map((l, i) => (
            <button
              aria-pressed={i === locationIndex}
              className={`hotspot ${i === locationIndex ? "active" : ""}`}
              key={l.id}
              onClick={() => onLocation(i)}
            >
              <span className="hotspot-index">{String(i + 1).padStart(2, "0")}</span>
              <div><strong>{l.label}</strong><small>{l.region}</small></div>
              <Crosshair size={15} aria-hidden />
            </button>
          ))}
        </div>
      </details>
      <details className="rail-disclosure expanded-content">
        <summary className="rail-disclosure-summary">
          <span><Layers size={13} aria-hidden="true" /> MAP OPTIONS</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="rail-disclosure-body">
          {(
            [
              ["change", "Highlight changes"],
              ["boundaries", "Show area outlines"],
              ["grid", "Show coordinate grid"],
            ] as const
          ).map(([id, label]) => (
            <div className="layer-row" key={id}>
              <label htmlFor={`${overlay ? "mobile" : "desktop"}-${id}`}>{label}</label>
              <Switch
                id={`${overlay ? "mobile" : "desktop"}-${id}`}
                checked={layers[id]}
                onCheckedChange={(v) => onLayers({ ...layers, [id]: v })}
                aria-label={label}
              />
            </div>
          ))}
        </div>
      </details>
      <details className="rail-disclosure expanded-content">
        <summary className="rail-disclosure-summary">
          <span><Info size={13} aria-hidden="true" /> DATA STATUS</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="rail-disclosure-body data-status-body">
          <strong>{p.id === "gcov" ? "DERIVED GCOV" : "SAMPLE · NOT OBSERVED"}</strong>
          <p>{p.id === "gcov" ? "Offline processed GCOV rasters. Radar signal changes require interpretation." : "Real geographic coordinates. Illustrative surface changes; no NASA observations are claimed."}</p>
          <small>NO LIVE TELEMETRY</small>
        </div>
      </details>
      <div className="rail-footer rail-footer-condensed" aria-label="Data mode">
        <span className="text-cyan">◇ <span className="expanded-content">{p.id === "gcov" ? "DERIVED DATA" : "SAMPLE MODE"}</span></span>
      </div>
    </>
  );
  return overlay ? (
    <div className="left-rail overlay-rail">{content}</div>
  ) : (
    <Sidebar
      collapsible="none"
      className={`left-rail w-full ${collapsed ? "collapsed" : ""}`}
    >
      {content}
    </Sidebar>
  );
}
