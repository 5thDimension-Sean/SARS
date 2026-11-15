// Scroll-linked camera path for the home globe. Pure functions: progress in, camera and text visibility out.
export interface CameraTarget { lon: number; lat: number; height: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoothstep = (v: number) => { const t = clamp01(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const wrapLon = (l: number) => ((l + 540) % 360) - 180;

/** Whole Earth, a little margin, over the Atlantic so the first move reads as a flight to the Americas. */
export const HERO_VIEW: CameraTarget = { lon: -60, lat: 22, height: 17_500_000 };
/** Low enough to read the surroundings, high enough that ~10 m previews are not magnified into blur. */
export const FOCUS_HEIGHT = 2_200_000;
export const FLIGHT_CEILING = 11_000_000;
/** Fraction of each leg spent parked on a stop, at either end. The text is readable while the camera dwells. */
export const DWELL = 0.2;

const greatCircleDegrees = (a: CameraTarget, b: CameraTarget) => {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
};

/** Camera for scroll position `p`, where integer values are stops (0 is the hero). Never mutates `stops`. */
export function cameraAt(stops: readonly CameraTarget[], p: number): CameraTarget {
  if (!stops.length) throw new Error("A journey needs at least one stop");
  const last = stops.length - 1;
  const q = Math.min(last, Math.max(0, Number.isFinite(p) ? p : 0));
  if (q >= last) return { ...stops[last] };
  const i = Math.floor(q), a = stops[i], b = stops[i + 1];
  const e = smoothstep((q - i - DWELL) / (1 - 2 * DWELL));
  let dLon = wrapLon(b.lon - a.lon);
  if (Math.abs(dLon) > 180) dLon -= Math.sign(dLon) * 360;
  const base = a.height + (b.height - a.height) * e;
  // Zoom out and back in across long hops; short hops stay low.
  const reach = Math.min(1, greatCircleDegrees(a, b) / 40);
  const lift = Math.max(0, FLIGHT_CEILING - Math.max(a.height, b.height)) * reach * Math.sin(Math.PI * e);
  return { lon: wrapLon(a.lon + dLon * e), lat: a.lat + (b.lat - a.lat) * e, height: base + lift };
}

/** Text visibility for stop `index`: 1 while the camera dwells there, easing to 0 a third of a leg away. */
export function textState(index: number, p: number): { opacity: number; x: number } {
  const d = p - index;
  const opacity = 1 - smoothstep((Math.abs(d) - 0.1) / 0.28);
  // Arrives from the left; leaves a little further to the right.
  const x = d < 0 ? -56 * (1 - opacity) : 28 * (1 - opacity);
  return { opacity, x };
}

/** Scroll progress (0 to stopCount - 1) for a runway element, given its bounding box and the viewport height. */
export function progressFor(rectTop: number, rectHeight: number, viewport: number, stopCount: number): number {
  const travel = Math.max(1, rectHeight - viewport);
  return clamp01(-rectTop / travel) * (stopCount - 1);
}
