"use client";
import { useEffect, useRef } from "react";
import type { PhenomenonId } from "@/lib/sample-schema";
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rasterCache = new Map<string, ImageData>();
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const hash = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7 + seed * 73.3) * 43758.5453;
    return n - Math.floor(n);
  };
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), sx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
    sy,
  );
}
function fbm(x: number, y: number, s: number) {
  return (
    noise(x, y, s) * 0.55 +
    noise(x * 2, y * 2, s) * 0.25 +
    noise(x * 4, y * 4, s) * 0.13 +
    noise(x * 8, y * 8, s) * 0.07
  );
}
export function ProceduralSurface({
  phenomenon,
  seed,
  stage,
  change,
  boundaries,
  polarization,
  viewMode,
}: {
  phenomenon: PhenomenonId;
  seed: number;
  stage: number;
  change: boolean;
  boundaries: boolean;
  polarization: "HH" | "HV";
  viewMode: "displacement" | "phase";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const w = 520,
      h = 490;
    el.width = w;
    el.height = h;
    const cacheKey = `${phenomenon}/${seed}/${stage}/${change}/${boundaries}/${phenomenon === "earthquake" ? "HH" : polarization}/${viewMode}`;
    const cached = rasterCache.get(cacheKey);
    if (cached) {
      ctx.putImageData(cached, 0, 0);
      return;
    }
    const img = ctx.createImageData(w, h),
      amount = stage / 6;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = x / w,
          v = y / h,
          n = fbm(u * 11, v * 11, seed),
          fine = noise(x * 0.6, y * 0.6, seed) - 0.5;
        let r = 0,
          g = 0,
          b = 0;
        if (phenomenon === "wetland") {
          const warp = fbm(u * 4, v * 4, seed + 1),
            river =
              0.46 + 0.12 * Math.sin(v * 7 + seed) + 0.04 * Math.sin(v * 20),
            distance = Math.abs(u - river),
            channel = Math.abs(Math.sin((u * 5 + v * 2 + warp) * 9));
          const water =
            distance < 0.028 + warp * 0.02 || (channel < 0.12 && n < 0.53);
          if (water) {
            r = 14 + fine * 9;
            g = 33 + n * 15;
            b = 38 + n * 20;
          } else {
            r = 25 + n * 53 + fine * 17;
            g = 45 + n * 65 + fine * 17;
            b = 29 + n * 40 + fine * 15;
          }
          const patch = noise(u * 9, v * 8, seed + 15);
          if (
            change &&
            amount > 0 &&
            patch > 0.6 - amount * 0.055 &&
            distance > 0.06 &&
            v > 0.25 &&
            v < 0.8
          ) {
            r = mix(r, 184, amount * 0.56);
            g = mix(g, 120, amount * 0.52);
            b = mix(b, 51, amount * 0.5);
          }
        } else if (phenomenon === "forest") {
          r = 18 + n * 36 + fine * 16;
          g = 34 + n * 52 + fine * 21;
          b = 24 + n * 27 + fine * 15;
          const road = Math.abs(u - (0.27 + v * 0.43));
          if (road < 0.008) {
            r = 111 + n * 20;
            g = 96 + n * 12;
            b = 62 + n * 7;
          }
          const bx = Math.floor(u * 15),
            by = Math.floor(v * 18),
            patch = noise(bx * 2.8, by * 2.8, seed + 10);
          const clearing =
            patch > 0.58 - amount * 0.13 &&
            u > 0.25 + v * 0.43 &&
            u < 0.67 + v * 0.3 &&
            v > 0.2 &&
            v < 0.9;
          if (clearing) {
            r = 75 + n * 67 + amount * 36;
            g = 68 + n * 45;
            b = 39 + n * 19;
            if (change) {
              r += amount * 45;
              g += amount * 10;
            }
          }
          if (
            Math.abs((u * 15) % 1) < 0.012 ||
            Math.abs((v * 18) % 1) < 0.009
          ) {
            r *= 0.8;
            g *= 0.8;
            b *= 0.8;
          }
        } else {
          const terrain = fbm((u + v * 0.3) * 7, v * 9, seed),
            ridge = Math.abs(Math.sin((u * 4 - v * 2 + terrain * 0.4) * 18));
          r = 32 + terrain * 46 + ridge * 5 + fine * 12;
          g = 34 + terrain * 48 + fine * 12;
          b = 32 + terrain * 42 + fine * 12;
          const fault = u - (0.35 + v * 0.28),
            envelope =
              Math.exp(-Math.abs(fault) * 8) * Math.sin(v * 2.8) * amount;
          if (change && amount > 0) {
            if (viewMode === "phase") {
              const phase = Math.sin(fault * 85 * amount + terrain * 3),
                q = (phase + 1) / 2;
              r = mix(r, 80 + 140 * q, envelope * 0.85);
              g = mix(g, 60 + 130 * Math.sin(q * 3.14), envelope * 0.8);
              b = mix(b, 205 - 110 * q, envelope * 0.8);
            } else {
              const toward = fault > 0;
              r = mix(r, toward ? 208 : 51, envelope * 0.7);
              g = mix(g, toward ? 98 : 133, envelope * 0.6);
              b = mix(b, toward ? 72 : 210, envelope * 0.8);
            }
          }
        }
        const edge = 0.7 + 0.3 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI),
          pol = phenomenon !== "earthquake" && polarization === "HH" ? 1.16 : 1;
        const i = (y * w + x) * 4;
        img.data[i] = r * edge * pol;
        img.data[i + 1] = g * edge * pol;
        img.data[i + 2] = b * edge * pol;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    if (boundaries) {
      ctx.strokeStyle = "#64d1c29c";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.23);
      ctx.lineTo(w * 0.79, h * 0.2);
      ctx.lineTo(w * 0.85, h * 0.75);
      ctx.lineTo(w * 0.28, h * 0.82);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#85d7c9";
      ctx.font = "11px monospace";
      ctx.fillText("SAMPLE AREA BOUNDARY", w * 0.22, h * 0.225);
    }
    if (change && stage > 0) {
      ctx.strokeStyle = phenomenon === "earthquake" ? "#e6c088ad" : "#efa756c7";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 3]);
      const shapes =
        phenomenon === "wetland"
          ? [
              [0.57, 0.34, 0.13, 0.12],
              [0.27, 0.56, 0.11, 0.16],
              [0.62, 0.62, 0.13, 0.09],
            ]
          : phenomenon === "forest"
            ? [
                [0.48, 0.32, 0.14, 0.13],
                [0.56, 0.53, 0.17, 0.14],
                [0.67, 0.73, 0.12, 0.09],
              ]
            : [];
      shapes.forEach(([x, y, sw, sh]) => {
        ctx.strokeRect(x * w, y * h, sw * w, sh * h);
      });
      if (phenomenon === "earthquake") {
        ctx.beginPath();
        ctx.moveTo(w * 0.35, 0);
        ctx.lineTo(w * 0.63, h);
        ctx.stroke();
      }
    }
    if (rasterCache.size >= 24)
      rasterCache.delete(rasterCache.keys().next().value!);
    rasterCache.set(cacheKey, ctx.getImageData(0, 0, w, h));
  }, [phenomenon, seed, stage, change, boundaries, polarization, viewMode]);
  return (
    <canvas ref={canvas} className="procedural-canvas" aria-hidden="true" />
  );
}
