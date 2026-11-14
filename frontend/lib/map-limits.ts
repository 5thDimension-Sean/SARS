// Camera limits so the map can never be zoomed out or panned past the published data.
import type { Bounds } from "./investigation.ts";

const TILE = 512; // MapLibre world size is 512 * 2^zoom pixels
const mercY = (lat: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;

/** Geographic extent visible in a viewport of the given pixel size. */
export function viewBounds(center: [number, number], zoom: number, widthPx: number, heightPx: number): Bounds {
  const world = TILE * 2 ** zoom;
  const cx = (center[0] + 180) / 360, cy = mercY(center[1]);
  const dx = widthPx / 2 / world, dy = heightPx / 2 / world;
  return [(cx - dx) * 360 - 180, latOf(cy + dy), (cx + dx) * 360 - 180, latOf(cy - dy)];
}

/** The most zoomed-out view that still fits the whole scene: the zoom-out limit. */
export function containView(scene: Bounds, widthPx: number, heightPx: number, paddingPx = 0): { center: [number, number]; zoom: number } {
  const [w, s, e, n] = scene;
  const sx = (e - w) / 360, sy = mercY(s) - mercY(n);
  const availW = Math.max(1, widthPx - 2 * paddingPx), availH = Math.max(1, heightPx - 2 * paddingPx);
  const zoom = Math.log2(Math.min(availW / (sx * TILE), availH / (sy * TILE)));
  return { center: [(w + e) / 2, latOf((mercY(s) + mercY(n)) / 2)], zoom };
}
