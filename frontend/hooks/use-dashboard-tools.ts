"use client";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { DashboardDataset } from "@/lib/sample-schema";
interface DashboardState {
  phenomenon: string;
  hotspot: string;
  acquisition: string;
  baseline: string;
  provenance: "sample" | "derived";
}
interface Registry {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function useDashboardTools(
  data: DashboardDataset,
  state: DashboardState,
  selectLocation: (p: number, l: number) => void,
) {
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "read_sar_dashboard",
        title: "Read SAR comparison",
        description:
          "Read the selected phenomenon, area, acquisition, baseline, and sample or derived provenance.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => current.current,
      },
      {
        name: "select_sar_hotspot",
        title: "Select observation hotspot",
        description:
          "Navigate the dashboard to a known sample hotspot or loaded GCOV frame. Returned provenance distinguishes samples from processed data.",
        inputSchema: {
          type: "object",
          properties: {
            hotspotId: {
              type: "string",
              enum: data.phenomena.flatMap((p) => p.locations.map((l) => l.id)),
            },
          },
          required: ["hotspotId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          if (
            !input ||
            typeof input !== "object" ||
            !("hotspotId" in input) ||
            Object.keys(input).some((k) => k !== "hotspotId")
          )
            throw new Error("Expected a known hotspotId.");
          const id = (input as { hotspotId: unknown }).hotspotId;
          for (let pi = 0; pi < data.phenomena.length; pi++) {
            const li = data.phenomena[pi].locations.findIndex(
              (l) => l.id === id,
            );
            if (li >= 0) {
              flushSync(() => selectLocation(pi, li));
              return current.current;
            }
          }
          throw new Error("Unknown hotspotId.");
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          registry.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Unsupported experimental registry must not interrupt the dashboard. */
      }
    }
    return () => lifecycle.abort();
  }, [data, selectLocation]);
}
