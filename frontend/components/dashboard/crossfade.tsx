"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-tween";
/** Keeps the previous phase's imagery under the new one while it fades in. */
export function Crossfade({
  phaseKey,
  children,
  duration = 380,
}: {
  phaseKey: string;
  children: ReactNode;
  duration?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const latest = useRef({ phaseKey, children });
  const [previous, setPrevious] = useState<{
    key: string;
    node: ReactNode;
  } | null>(null);
  useEffect(() => {
    const last = latest.current;
    latest.current = { phaseKey, children };
    if (last.phaseKey === phaseKey) return;
    if (reduced) return;
    setPrevious({ key: last.phaseKey, node: last.children });
    const timer = window.setTimeout(() => setPrevious(null), duration);
    return () => window.clearTimeout(timer);
  }, [phaseKey, children, duration, reduced]);
  return (
    <div className="crossfade">
      {previous && (
        <div
          className="crossfade-old"
          key={`old-${previous.key}`}
          aria-hidden
          style={{ animationDuration: `${duration}ms` }}
        >
          {previous.node}
        </div>
      )}
      <div
        className={previous ? "crossfade-new" : ""}
        key={`new-${phaseKey}`}
        style={{ animationDuration: `${duration}ms` }}
      >
        {children}
      </div>
    </div>
  );
}
