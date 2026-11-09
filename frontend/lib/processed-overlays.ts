import { z } from "zod";

// Accept only packaged assets: no remote URLs, traversal, credentials or queries.
const asset = z.string().regex(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.png$/);
const text = z.string().trim().min(1).max(500);
const finite = z.number().finite();
const bounds = z.tuple([finite, finite, finite, finite]).refine(([w, s, e, n]) =>
  w >= -180 && e <= 180 && s >= -85.05 && n <= 85.05 && w < e && s < n);
const qa = z.object({ status: z.enum(["PASS", "FAIL", "UNVERIFIED"]), summary: text });
const schema = z.object({
  schemaVersion: z.literal("1.0"), provenance: z.literal("derived"),
  source: text, dryRun: z.literal(false), processingNotes: z.array(text),
  dbRanges: z.object({ HH: z.tuple([finite, finite]).optional(), HV: z.tuple([finite, finite]).optional() }),
  frames: z.array(z.object({
    id: text, label: text, crs: z.literal("EPSG:4326"), overlayCrs: z.literal("EPSG:3857"), bounds,
    overlaySize: z.tuple([z.number().int().positive().max(8192), z.number().int().positive().max(8192)]),
    overlayTransform: z.tuple([finite, finite, finite, finite, finite, finite]),
    acquisitions: z.array(z.object({
      date: z.string().datetime(), productType: z.literal("GCOV"), sourceFile: text,
      productVersion: text, compositeReleaseId: text, dataMaturity: text,
      overlays: z.object({ HH: asset.optional(), HV: asset.optional() }),
      qa: qa.optional(),
    })),
  })),
});

export interface ProcessedOverlay {
  id: string; label: string; url: string; date: string; pol: "HH" | "HV";
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  source: string; sourceFile: string; version: string; maturity: string;
  qa: { status: "PASS" | "FAIL" | "UNVERIFIED"; summary: string };
  range: [number, number]; notes: string[];
}

export function parseProcessedOverlays(input: unknown, directory: string): ProcessedOverlay[] {
  const manifest = schema.parse(input);
  const result: ProcessedOverlay[] = [];
  for (const frame of manifest.frames) {
    const [w, s, e, n] = frame.bounds;
    const [dx, rx, x, ry, dy, y] = frame.overlayTransform;
    const [width, height] = frame.overlaySize;
    const longitude = (v: number) => v / 6378137 * 180 / Math.PI;
    const latitude = (v: number) => (2 * Math.atan(Math.exp(v / 6378137)) - Math.PI / 2) * 180 / Math.PI;
    const expected = [longitude(x), latitude(y + height * dy), longitude(x + width * dx), latitude(y)];
    if (dx <= 0 || dy >= 0 || rx !== 0 || ry !== 0 || expected.some((v, i) => Math.abs(v - frame.bounds[i]) > 1e-6)) {
      throw new Error("Overlay transform does not match its geographic bounds");
    }
    const days = new Set<string>();
    for (const acquisition of frame.acquisitions) {
      const day = acquisition.date.slice(0, 10);
      if (days.has(day)) throw new Error("Duplicate acquisition date");
      days.add(day);
      for (const pol of ["HH", "HV"] as const) {
        const path = acquisition.overlays[pol];
        if (!path) continue;
        const range = manifest.dbRanges[pol];
        if (!range || range[0] >= range[1]) throw new Error("Missing fixed display range");
        result.push({
          id: `${frame.id}/${acquisition.date}/${pol}`, label: `${frame.label} · ${day} · ${pol}`,
          url: `${directory}${path}`, date: acquisition.date, pol,
          coordinates: [[w, n], [e, n], [e, s], [w, s]], source: manifest.source,
          sourceFile: acquisition.sourceFile, version: `${acquisition.productVersion} / ${acquisition.compositeReleaseId}`,
          maturity: acquisition.dataMaturity, range, notes: manifest.processingNotes,
          qa: acquisition.qa ?? { status: "UNVERIFIED", summary: "No scientific QA review is supplied by this manifest." },
        });
      }
    }
  }
  return result;
}

export async function loadProcessedOverlays(manifestUrl: string, signal: AbortSignal) {
  const response = await fetch(manifestUrl, { signal, credentials: "omit", redirect: "error" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Manifest request failed");
  return parseProcessedOverlays(await response.json(), manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1));
}
