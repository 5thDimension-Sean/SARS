"use client";
import {
  Info,
  Satellite,
  TriangleAlert,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { SignalChart } from "./signal-chart";
import type {
  Acquisition,
  Phenomenon,
  Polarization,
  Hotspot,
} from "@/lib/sample-schema";
import { displayDate, daysBetween } from "@/lib/dashboard-utils";
export function AnalysisRail({
  phenomenon: p,
  location,
  before,
  after,
  polarization,
  onPolarization,
  viewMode,
  onViewMode,
  overlay = false,
}: {
  phenomenon: Phenomenon;
  location: Hotspot;
  before: Acquisition;
  after: Acquisition;
  polarization: Polarization;
  onPolarization: (v: Polarization) => void;
  viewMode: "displacement" | "phase";
  onViewMode: (v: "displacement" | "phase") => void;
  overlay?: boolean;
}) {
  const seismic = p.analysis === "displacement";
  const derived = after.provenance === "derived";
  const badge = derived ? "DERIVED" : "SAMPLE";
  const metric = (
    derived
      ? after.metrics.find((m) => m.id === `mean-${polarization}`)
      : after.metrics[0]
  )!;
  const baselineMetric = derived
    ? before.metrics.find((m) => m.id === metric.id)
    : before.metrics[0];
  const delta =
    metric.value !== null && baselineMetric?.value != null
      ? metric.value - baselineMetric.value
      : null;
  const status =
    derived && delta === null
      ? "WARN"
      : before.date === after.date
        ? "NOMINAL"
        : metric.status;
  return (
    <div className={`analysis-rail ${overlay ? "overlay-rail" : ""}`}>
      <div className="rail-heading">
        SIGNAL ANALYSIS{" "}
        <span className={`tiny-badge ${derived ? "derived-badge" : ""}`}>
          {badge}
        </span>
      </div>
      <div className="analysis-intro">Compare the radar signal, then check the dates and caveats. A change in the signal does not prove what caused it.</div>
      <section className="rail-section metric-section">
        <div className="eyebrow">{metric.label.toUpperCase()}</div>
        <div className="primary-metric">
          {delta === null
            ? "N/A"
            : derived
              ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`
              : Math.abs(delta).toFixed(1)}
          <span>{metric.unit}</span>
        </div>
        <p className="metric-caption">
          {derived
            ? "Mean signal difference from baseline"
            : "Illustrative difference from baseline"}
        </p>
        {derived && <p className="sign-note">{metric.note}</p>}
        {derived &&
          location.processingNotes
            ?.filter((note) => note.startsWith("WARN:"))
            .map((note, i) => (
              <p className="sign-note text-amber" key={i}>
                {note}
              </p>
            ))}
        <div className={`status ${status.toLowerCase()}`}>
          {status === "NOMINAL" ? (
            <CheckCircle2 size={13} />
          ) : (
            <TriangleAlert size={13} />
          )}{" "}
          {derived
            ? status === "WARN"
              ? "WARN · SIGNAL UNAVAILABLE"
              : "NOMINAL · DATA LOADED"
            : `${status} · ${status === "NOMINAL" ? "SAMPLE SIGNAL" : "SAMPLE CHANGE"}`}
        </div>
        <div className="secondary-metrics">
          {(derived
            ? after.metrics.filter((m) => m.id === `pixels-${polarization}`)
            : after.metrics.slice(1)
          ).map((m) => (
            <div key={m.id}>
              <span>{m.label}</span>
              <strong>
                {m.value === null
                  ? "N/A"
                  : derived
                    ? m.value.toLocaleString()
                    : m.value}
                <small> {m.unit}</small>
              </strong>
              <span className="metric-provenance">
                {m.provenance.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="rail-section analysis-controls">
        <div className="eyebrow">ANALYSIS SETTINGS</div>
        {seismic ? (
          <Select
            value={viewMode}
            onValueChange={(v) => onViewMode(v as "displacement" | "phase")}
          >
            <SelectTrigger
              className="analysis-select"
              aria-label="Earthquake analysis view"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="displacement">
                LOS displacement · cm
              </SelectItem>
              <SelectItem value="phase">Wrapped interferogram · rad</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select
            value={polarization}
            onValueChange={(v) => onPolarization(v as Polarization)}
          >
            <SelectTrigger
              className="analysis-select"
              aria-label="Polarization"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {after.polarization.includes("HV") && (
                <SelectItem value="HV">HV · Cross polarization</SelectItem>
              )}
              {after.polarization.includes("HH") && (
                <SelectItem value="HH">HH · Co polarization</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      </section>
      <Tabs defaultValue="signal" className="analysis-tabs">
        <TabsList variant="line" className="analysis-tab-list">
          <TabsTrigger value="signal">Signal chart</TabsTrigger>
          <TabsTrigger value="acquisition">Data details</TabsTrigger>
        </TabsList>
        <TabsContent value="signal">
          <section className="rail-section chart-section">
            <SignalChart
              phenomenon={p}
              before={before}
              after={after}
              polarization={polarization}
            />
          </section>
          <section className="rail-section insight-section">
            <div className="eyebrow">
              <Activity size={13} />
              COMPARISON INSIGHT
            </div>
            <p>
              {before.date === after.date
                ? "The same acquisition is selected on both sides. Step forward to compare a change."
                : after.insight}
            </p>
            <div className="comparison-interval">
              {daysBetween(before.date, after.date)} DAYS{" "}
              <span>
                {before.date === after.date
                  ? "SAME ACQUISITION"
                  : "BETWEEN SELECTED PASSES"}
              </span>
            </div>
          </section>
        </TabsContent>
        <TabsContent value="acquisition">
          <section className="rail-section">
            <div className="eyebrow">
              <Satellite size={14} />
              SELECTED ACQUISITION
            </div>
            <dl className="acquisition-details">
              <div>
                <dt>Date</dt>
                <dd>{displayDate(after.date, true)}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>
                  {after.productType} · {badge}
                </dd>
              </div>
              <div>
                <dt>Polarization</dt>
                <dd>{seismic ? "HH" : polarization}</dd>
              </div>
              <div>
                <dt>Orbit / frame</dt>
                <dd>
                  {after.orbit} / {after.frame}
                </dd>
              </div>
              <div>
                <dt>Direction</dt>
                <dd>{after.passDirection}</dd>
              </div>
              <div>
                <dt>Repeat cycle</dt>
                <dd>12 days nominal</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{after.productVersion}</dd>
              </div>
              {derived && (
                <>
                  <div>
                    <dt>Composite release</dt>
                    <dd>{after.compositeReleaseId ?? "UNKNOWN"}</dd>
                  </div>
                  <div>
                    <dt>Data maturity</dt>
                    <dd>{after.dataMaturity ?? "UNKNOWN"}</dd>
                  </div>
                </>
              )}
              {derived && (
                <div>
                  <dt>Track</dt>
                  <dd>{location.track}</dd>
                </div>
              )}
              <div>
                <dt>Footprint</dt>
                <dd>
                  {derived
                    ? "Manifest geographic bounds"
                    : `${location.areaKm2} km² · SAMPLE`}
                </dd>
              </div>
              <div>
                <dt>Layer source</dt>
                <dd>{derived ? after.source : "Procedural sample"}</dd>
              </div>
            </dl>
            <p className="sign-note">
              {derived
                ? "Acquisition identifiers are read from the source product. The preview uses fixed display ranges and transparent masked pixels."
                : "Dates, orbit/frame identifiers, and coverage are illustrative. No NASA products are loaded for this sample."}
            </p>
            {derived && after.cogUrls?.[polarization] && (
              <a
                className="cog-link"
                href={after.cogUrls[polarization]}
                download
              >
                Download {polarization} dB COG
              </a>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <section className="rail-section explanation-section">
        <div className="eyebrow">
          <Info size={14} />
          WHAT AM I SEEING?
        </div>
        <p className="explanation">{p.explanation}</p>
        <p className="limitation">{p.limitation}</p>
      </section>
    </div>
  );
}
