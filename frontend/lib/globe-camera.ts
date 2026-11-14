// Camera plan for the story globe (CesiumJS). Heights are metres above the ellipsoid.
import type { Bounds, LonLat } from "./investigation.ts";

export interface CameraTarget { lon: number; lat: number; height: number }
/** Whole Earth in frame, over the middle of the contiguous US. */
export const OVERVIEW: CameraTarget = { lon: -98, lat: 28, height: 12_000_000 };
/** Low enough to read the surrounding region, high enough that the bundled ~10 km imagery is not magnified into blur. */
export const FOCUS_HEIGHT = 2_200_000;
/** The flight rises to at most this height between stops, which gives the zoom-out-then-in arc. */
export const FLIGHT_CEILING = 9_000_000;

export const centerOf = ([w, s, e, n]: Bounds): LonLat => [(w + e) / 2, (s + n) / 2];

export function focusTarget(bounds: Bounds): CameraTarget {
  const [lon, lat] = centerOf(bounds);
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new Error("Invalid scene bounds");
  return { lon, lat, height: FOCUS_HEIGHT };
}

/** Flight length in seconds. Short hops between stops feel immediate; the trip back to orbit is a touch quicker still. */
export const FLIGHT_SECONDS = { stop: 1.6, overview: 1.2 } as const;
/** Hero globe: the whole Earth with a little margin, so the sphere never touches the panel edge. */
export const HERO_VIEW: CameraTarget = { lon: -98, lat: 24, height: 11_500_000 };
/** Hero auto-rotation, degrees of longitude per second. Slow enough to read as calm. */
export const HERO_SPIN_DEG_PER_S = 3.5;
