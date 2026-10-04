"use client";
import { useRef } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import type { Hotspot } from "@/lib/sample-schema";
import { displayDate, daysBetween } from "@/lib/dashboard-utils";
const SPEEDS = ["0.5", "1", "2"];
/**
 * Slim transport bar. Selection is always one of the fixed acquisitions;
 * only the thumb's visual movement between stops is eased (CSS transition).
 */
export function TimelinePanel({
  location,
  index,
  baseline,
  onIndex,
  onBaseline,
  playing,
  onPlaying,
  speed,
  onSpeed,
}: {
  location: Hotspot;
  index: number;
  baseline: number;
  onIndex: (i: number) => void;
  onBaseline: (i: number) => void;
  playing: boolean;
  onPlaying: (v: boolean) => void;
  speed: string;
  onSpeed: (v: string) => void;
}) {
  const acquisitions = location.acquisitions;
  const last = acquisitions.length - 1;
  const single = acquisitions.length === 1;
  const derived = location.provenance === "derived";
  const track = useRef<HTMLDivElement>(null);
  const t0 = Date.parse(acquisitions[0].date),
    span = Math.max(1, Date.parse(acquisitions[last].date) - t0);
  const pct = (i: number) =>
    single ? 0 : ((Date.parse(acquisitions[i].date) - t0) / span) * 100;
  const nearest = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    const p = ((clientX - box.left) / box.width) * 100;
    let best = 0;
    acquisitions.forEach((_, i) => {
      if (Math.abs(pct(i) - p) < Math.abs(pct(best) - p)) best = i;
    });
    return best;
  };
  const dragging = useRef(false);
  const selected = acquisitions[index];
  const event = location.events.find((e) => e.date === selected.date);
  const valueText = `${displayDate(selected.date, true)}, acquisition ${index + 1} of ${acquisitions.length}${event ? `, ${event.label}` : ""}, ${derived ? "derived" : "sample"} data`;
  const keyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: Math.min(last, index + 1),
      ArrowUp: Math.min(last, index + 1),
      ArrowLeft: Math.max(0, index - 1),
      ArrowDown: Math.max(0, index - 1),
      Home: 0,
      End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      onIndex(map[e.key]);
    }
  };
  return (
    <section className="transport" aria-label="Acquisition transport">
      <div className="transport-controls">
        <button
          className="icon-button"
          aria-label="Previous acquisition"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
        >
          <SkipBack size={14} />
        </button>
        <button
          className={`play-button ${playing ? "playing" : ""}`}
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          disabled={single}
          onClick={() => onPlaying(!playing)}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button
          className="icon-button"
          aria-label="Next acquisition"
          disabled={index === last}
          onClick={() => onIndex(index + 1)}
        >
          <SkipForward size={14} />
        </button>
      </div>
      <div className="transport-date">
        <span className="eyebrow">
          {String(index + 1).padStart(2, "0")}/
          {String(acquisitions.length).padStart(2, "0")}
        </span>
        <strong data-testid="selected-date">
          {displayDate(selected.date, true)}
        </strong>
      </div>
      <div className="transport-base">
        <label id="baseline-label" className="eyebrow">
          BASE
        </label>
        <Select
          value={String(baseline)}
          onValueChange={(v) => onBaseline(Number(v))}
        >
          <SelectTrigger
            aria-labelledby="baseline-label"
            className="baseline-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {acquisitions.slice(0, index + 1).map((a, i) => (
              <SelectItem value={String(i)} key={a.date}>
                {displayDate(a.date, true)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className="transport-track"
        ref={track}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button") || single) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onIndex(nearest(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) {
            const i = nearest(e.clientX);
            if (i !== index) onIndex(i);
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="transport-rail" />
        <div
          className="transport-progress"
          style={{ width: `${pct(index)}%` }}
        />
        {acquisitions.slice(1).map((a, i) => {
          const days = daysBetween(acquisitions[i].date, a.date);
          return days > 12 ? (
            <div
              key={a.date}
              className="transport-gap"
              style={{
                left: `${pct(i)}%`,
                width: `${pct(i + 1) - pct(i)}%`,
              }}
              title={`${days}-day gap; no intermediate acquisition`}
            >
              <span>{days}D GAP</span>
            </div>
          ) : null;
        })}
        {acquisitions.map((a, i) => {
          const ev = location.events.find((e) => e.date === a.date);
          const showLabel = i === 0 || i === last || i === index;
          return (
            <button
              key={a.date}
              className={`transport-tick ${i === index ? "selected" : ""} ${i === baseline && i !== index ? "base" : ""} ${ev ? "event" : ""}`}
              style={{ left: `${pct(i)}%` }}
              aria-label={`${displayDate(a.date, true)}${ev ? `, ${ev.label}` : ""}`}
              aria-pressed={i === index}
              title={ev?.label}
              onClick={() => onIndex(i)}
            >
              {ev && <i className={ev.status.toLowerCase()}>◆</i>}
              <b />
              {showLabel && <span>{displayDate(a.date)}</span>}
            </button>
          );
        })}
        <div
          className="transport-thumb"
          role="slider"
          tabIndex={single ? -1 : 0}
          aria-label="Acquisition date"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={index}
          aria-valuetext={valueText}
          aria-disabled={single}
          style={{ left: `${pct(index)}%` }}
          onKeyDown={keyDown}
        />
      </div>
      <button
        className="speed-button"
        aria-label={`Playback speed ${speed}×. Activate to change.`}
        onClick={() =>
          onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])
        }
      >
        {speed}×
      </button>
      <span className="transport-tag">{derived ? "DERIVED" : "SAMPLE DATA"}</span>
    </section>
  );
}
