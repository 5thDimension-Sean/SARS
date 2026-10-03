"use client";
import {
  Waves,
  Activity,
  Trees,
  Crosshair,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Sidebar } from "@/components/ui/sidebar";
import type { Phenomenon, LayerState } from "@/lib/sample-schema";
const icons = { wetland: Waves, earthquake: Activity, forest: Trees };
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
        <span className="expanded-content">OBSERVATION LAYERS</span>
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
      <section className="rail-section expanded-content">
        <div className="eyebrow">
          HOTSPOTS <span>02</span>
        </div>
        {p.locations.map((l, i) => (
          <button
            aria-pressed={i === locationIndex}
            className={`hotspot ${i === locationIndex ? "active" : ""}`}
            key={l.id}
            onClick={() => onLocation(i)}
          >
            <span className="hotspot-index">0{i + 1}</span>
            <div>
              <strong>{l.label}</strong>
              <small>{l.region}</small>
            </div>
            <Crosshair size={15} aria-hidden />
          </button>
        ))}
      </section>
      <section className="rail-section expanded-content">
        <div className="eyebrow">
          <Layers size={13} aria-hidden />
          VIEWPORT LAYERS
        </div>
        {(
          [
            ["change", "Change overlay"],
            ["boundaries", "Area boundaries"],
            ["grid", "Coordinate grid"],
          ] as const
        ).map(([id, label]) => (
          <div className="layer-row" key={id}>
            <label htmlFor={`${overlay ? "mobile" : "desktop"}-${id}`}>
              {label}
            </label>
            <Switch
              id={`${overlay ? "mobile" : "desktop"}-${id}`}
              checked={layers[id]}
              onCheckedChange={(v) => onLayers({ ...layers, [id]: v })}
              aria-label={label}
            />
          </div>
        ))}
      </section>
      <div className="rail-note expanded-content">
        <Info size={16} aria-hidden />
        <p>
          Real coordinates.
          <br />
          Illustrative surface changes.
        </p>
      </div>
      <div className="rail-footer">
        <span className="text-cyan">
          ◇ <span className="expanded-content">SAMPLE MODE</span>
        </span>
        <small className="expanded-content">NO LIVE TELEMETRY</small>
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
