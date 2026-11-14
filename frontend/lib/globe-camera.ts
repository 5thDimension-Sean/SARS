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
