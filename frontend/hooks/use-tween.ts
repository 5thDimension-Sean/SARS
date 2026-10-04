"use client";
import { useEffect, useRef, useState } from "react";
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
/** Visual interpolation only: the final value always equals the target exactly. */
export function useTween(target: number | null, duration = 450) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState<number | null>(target);
  const current = useRef<number | null>(target);
  useEffect(() => {
    const from = current.current;
    if (target === null || from === null || reduced || from === target) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = t === 1 ? target : from + (target - from) * ease(t);
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);
  return value;
}
type Row = Record<string, number | null | undefined>;
/** Interpolates numeric fields of a chart series between selections. */
export function useTweenedSeries<T extends Row>(
  targetRows: T[],
  selectionKey: string,
  duration = 450,
) {
  const reduced = usePrefersReducedMotion();
  const latest = useRef(targetRows);
  latest.current = targetRows;
  const [series, setSeries] = useState<T[]>(targetRows);
  const current = useRef<T[]>(targetRows);
  useEffect(() => {
    const target = latest.current;
    const from = current.current;
    if (reduced || from === target || from.length !== target.length) {
      current.current = target;
      setSeries(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = ease(t);
      const next =
        t === 1
          ? target
          : target.map((row, i) => {
              const out: Row = { ...row };
              for (const key of Object.keys(row)) {
                const a = from[i]?.[key],
                  b = row[key];
                if (typeof a === "number" && typeof b === "number")
                  out[key] = a + (b - a) * k;
              }
              return out as T;
            });
      current.current = next;
      setSeries(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [selectionKey, duration, reduced]);
  return series;
}
