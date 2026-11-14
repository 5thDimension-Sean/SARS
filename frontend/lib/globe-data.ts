// Self-contained geometry for the story globe: nothing here needs a network request or a basemap.
import type { Bounds, LonLat } from "./investigation.ts";

type Line = { type: "Feature"; properties: Record<string, never>; geometry: { type: "LineString"; coordinates: LonLat[] } };
export type LineCollection = { type: "FeatureCollection"; features: Line[] };

const line = (coordinates: LonLat[]): Line => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });

/** Meridians and parallels every `step` degrees, sampled finely enough to curve on a globe. */
export function graticule(step = 15): LineCollection {
  const features: Line[] = [];
  for (let lon = -180; lon < 180; lon += step) {
    const pts: LonLat[] = [];
    for (let lat = -80; lat <= 80; lat += 4) pts.push([lon, lat]);
    features.push(line(pts));
  }
  for (let lat = -75; lat <= 75; lat += step) {
    const pts: LonLat[] = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push([lon, lat]);
    features.push(line(pts));
  }
  return { type: "FeatureCollection", features };
}

/** Closed rectangle outlines for scene footprints. */
export function footprints(boxes: readonly Bounds[]): LineCollection {
  return { type: "FeatureCollection", features: boxes.map(([w, s, e, n]) => line([[w, s], [e, s], [e, n], [w, n], [w, s]])) };
}
