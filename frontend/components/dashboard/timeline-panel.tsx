"use client";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  TriangleAlert,
} from "lucide-react";
import { AccessibleSlider } from "./accessible-slider";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import type { Hotspot } from "@/lib/sample-schema";
import { displayDate, daysBetween } from "@/lib/dashboard-utils";
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
  const derived = location.provenance === "derived";
  const singleAcquisition = acquisitions.length === 1;
  return (
    <section className="timeline-panel" aria-label="Time comparison">
      <div className="timeline-top">
        <div className="timeline-heading">
          <span className="eyebrow">TIME COMPARISON</span>
          <span className="timeline-count">
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(acquisitions.length).padStart(2, "0")} ACQUISITIONS
          </span>
        </div>
        <div className="timeline-actions">
          <button
            className="icon-button"
            aria-label="Previous acquisition"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            <SkipBack size={15} />
          </button>
          <button
            className={`play-button ${playing ? "playing" : ""}`}
            aria-label={playing ? "Pause timeline" : "Play timeline"}
            disabled={singleAcquisition}
            onClick={() => onPlaying(!playing)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className="icon-button"
            aria-label="Next acquisition"
            disabled={index === acquisitions.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            <SkipForward size={15} />
          </button>
          <Select value={speed} onValueChange={onSpeed}>
            <SelectTrigger className="speed-select" aria-label="Playback speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5×</SelectItem>
              <SelectItem value="1">1×</SelectItem>
              <SelectItem value="2">2×</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="comparison-dates">
        <div className="baseline-control">
          <label id="baseline-label">BASELINE</label>
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
        <span className="comparison-dash" />
        <div>
          <span className="eyebrow">SELECTED PASS</span>
          <strong data-testid="selected-date">
            {displayDate(acquisitions[index].date, true)}
          </strong>
        </div>
        <span
          className="latest-mobile"
          title={`Latest ${derived ? "derived" : "sample"} acquisition: ${acquisitions.at(-1)!.date}, ${acquisitions.at(-1)!.productType}, orbit ${acquisitions.at(-1)!.orbit}, frame ${acquisitions.at(-1)!.frame}`}
        >
          LATEST {displayDate(acquisitions.at(-1)!.date)}
          <small>
            {acquisitions.at(-1)!.productType} · F
            {String(acquisitions.at(-1)!.frame).padStart(3, "0")} ·{" "}
            {derived ? "DERIVED" : "SAMPLE"}
          </small>
        </span>
      </div>
      <div className="date-step-track">
        <div className="date-gaps">
          {acquisitions.slice(1).map((a, i) => {
            const days = daysBetween(acquisitions[i].date, a.date);
            return days > 12 ? (
              <div
                key={a.date}
                className="acquisition-gap"
                style={{
                  left: `${(i / (acquisitions.length - 1)) * 100}%`,
                  width: `${100 / (acquisitions.length - 1)}%`,
                }}
                title={`${days}-day gap; no intermediate acquisition`}
              >
                <TriangleAlert size={10} />
                {days}D GAP
              </div>
            ) : null;
          })}
        </div>
        <AccessibleSlider
          min={0}
          max={Math.max(1, acquisitions.length - 1)}
          disabled={singleAcquisition}
          step={1}
          value={[index]}
          onValueChange={(v) => onIndex(v[0])}
          label="Acquisition date"
          valueText={displayDate(acquisitions[index].date, true)}
          className="date-slider"
        />
        <div className="date-ticks">
          {acquisitions.map((a, i) => {
            const event = location.events.find((e) => e.date === a.date);
            return (
              <button
                key={a.date}
                onClick={() => onIndex(i)}
                className={`${i === index ? "selected" : ""} ${event ? "event-date" : ""}`}
                aria-label={`${displayDate(a.date, true)}${event ? `, ${event.label}` : ""}`}
                aria-pressed={i === index}
                title={event?.label}
              >
                <span className="date-tick">{event ? "◆" : ""}</span>
                <span
                  className={
                    acquisitions.length > 7 &&
                    i !== index &&
                    i !== acquisitions.length - 1 &&
                    i % Math.ceil((acquisitions.length - 1) / 6) !== 0
                      ? "sparse-date-label"
                      : ""
                  }
                >
                  {displayDate(a.date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="timeline-bottom">
        <span>
          {derived ? "OFFLINE ACQUISITIONS" : "◆ SAMPLE EVENT"}{" "}
          <span className="timeline-key-help"> / ← → STEP · HOME / END</span>
        </span>
        <span>
          12-DAY NOMINAL{" "}
          <span className="text-cyan">· {derived ? "DERIVED" : "SAMPLE"}</span>
        </span>
      </div>
    </section>
  );
}
