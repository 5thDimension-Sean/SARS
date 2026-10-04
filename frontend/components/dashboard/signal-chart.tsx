"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Acquisition,
  Phenomenon,
  Polarization,
} from "@/lib/sample-schema";
import { displayDate } from "@/lib/dashboard-utils";
import { useEffect, useRef, useState } from "react";
import { useTweenedSeries } from "@/hooks/use-tween";
export function SignalChart({
  phenomenon,
  before,
  after,
  polarization,
}: {
  phenomenon: Phenomenon;
  before: Acquisition;
  after: Acquisition;
  polarization: Polarization;
}) {
  const chartRoot = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!chartRoot.current) return;
    const observer = new ResizeObserver((entries) =>
      setVisible(entries[0].contentRect.width > 0),
    );
    observer.observe(chartRoot.current);
    return () => observer.disconnect();
  }, []);
  const seismic = phenomenon.analysis === "displacement";
  const derived = after.provenance === "derived";
  const beforeDistribution = before.histogramDb?.[polarization],
    afterDistribution = after.histogramDb?.[polarization];
  const targetSeries: {
    before: number | null;
    after: number;
    distanceKm?: number;
    db?: number;
  }[] = seismic
    ? after.displacementProfileCm.map((pt, i) => ({
        ...pt,
        before: before.displacementProfileCm[i]?.displacementCm,
        after: pt.displacementCm,
      }))
    : derived && afterDistribution
      ? afterDistribution.counts.map((_, i) => ({
          db:
            (afterDistribution.binEdges[i] +
              afterDistribution.binEdges[i + 1]) /
            2,
          before: beforeDistribution
            ? beforeDistribution.normalized[i] * 100
            : null,
          after: afterDistribution.normalized[i] * 100,
        }))
      : after.histogramBinsDb.map((bin, i) => ({
          db: bin.db,
          before: before.histogramBinsDb[i]?.[polarization],
          after: bin[polarization],
        }));
  const series = useTweenedSeries(
    targetSeries,
    `${phenomenon.id}/${before.date}/${after.date}/${polarization}/${after.orbit}`,
  );
  const axes = (
    <>
      <CartesianGrid stroke="#283740" strokeDasharray="2 4" vertical={false} />
      <XAxis
        type="number"
        dataKey={seismic ? "distanceKm" : "db"}
        domain={
          seismic
            ? [0, 24]
            : derived
              ? (after.dbRanges?.[polarization] ?? [-30, 0])
              : [-30, 0]
        }
        ticks={
          seismic
            ? [0, 6, 12, 18, 24]
            : derived
              ? undefined
              : [-30, -20, -10, 0]
        }
        tick={{ fill: "#9aaebb", fontSize: 11 }}
        axisLine={{ stroke: "#3e515b" }}
        tickLine={false}
      />
      <YAxis
        width={32}
        tick={{ fill: "#9aaebb", fontSize: 10 }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        contentStyle={{
          background: "#101b22",
          border: "1px solid #3d5662",
          fontSize: 12,
        }}
        labelStyle={{ color: "#dae7ed" }}
        formatter={(v, name) => [
          `${Number(v).toFixed(2)} ${seismic ? "cm" : "%"}`,
          name,
        ]}
        labelFormatter={(v) => `${v} ${seismic ? "km" : "dB"}`}
      />
    </>
  );
  return (
    <>
      <div className="chart-heading">
        <span>
          {seismic ? "LOS DISPLACEMENT PROFILE" : "BACKSCATTER DISTRIBUTION"}
        </span>
        <span className={`tiny-badge ${derived ? "derived-badge" : ""}`}>
          {derived ? "DERIVED" : "SAMPLE"}
        </span>
      </div>
      <div className="chart-subtitle">
        {seismic
          ? "Across fault corridor · centimeters"
          : `${polarization} polarization · gamma-0 · pixel frequency (%)`}
      </div>
      <div
        className="signal-chart"
        ref={chartRoot}
        role="img"
        aria-label={
          seismic
            ? `Sample displacement profile in centimeters, comparing ${before.date} and ${after.date}`
            : `${derived ? "Derived" : "Sample"} ${polarization} histogram in dB, comparing ${before.date} and ${after.date}`
        }
      >
        {visible && (
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 280, height: 139 }}
          >
            {seismic ? (
              <LineChart
                data={series}
                margin={{ top: 8, right: 9, left: 0, bottom: 0 }}
              >
                {axes}
                <ReferenceLine y={0} stroke="#7c8f9a" />
                <ReferenceLine x={12} stroke="#bf8c56" strokeDasharray="3 3" />
                <Line
                  name={`Before ${before.date}`}
                  type="monotone"
                  dataKey="before"
                  stroke="#b5c6d2"
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  name={`After ${after.date}`}
                  type="monotone"
                  dataKey="after"
                  stroke="#51d4d4"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <AreaChart
                data={series}
                margin={{ top: 8, right: 9, left: 0, bottom: 0 }}
              >
                {axes}
                <defs>
                  <linearGradient id="signal-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#51d4d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#51d4d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  name={`Before ${before.date}`}
                  type="monotone"
                  dataKey="before"
                  stroke="#b5c6d2"
                  strokeWidth={1.6}
                  fill="#b5c6d2"
                  fillOpacity={0.04}
                  isAnimationActive={false}
                />
                <Area
                  name={`After ${after.date}`}
                  type="monotone"
                  dataKey="after"
                  stroke="#51d4d4"
                  strokeWidth={2}
                  fill="url(#signal-fill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
      <div className="chart-axis-label">
        {seismic ? "DISTANCE ACROSS CORRIDOR (km)" : "BACKSCATTER (dB)"}
      </div>
      <div className="chart-legend">
        <span>
          <i className="before-line" /> {displayDate(before.date)} · BEFORE
        </span>
        <span>
          <i className="after-line" /> {displayDate(after.date)} · AFTER
        </span>
      </div>
      {seismic && (
        <p className="sign-note">+ toward satellite · − away from satellite</p>
      )}
      {derived && (
        <p className="sign-note">
          Fixed-range bins; percentages use all valid reduced-raster pixels.
          Out-of-range values are omitted.{" "}
          {!beforeDistribution && "Baseline polarization unavailable."}
        </p>
      )}
    </>
  );
}
