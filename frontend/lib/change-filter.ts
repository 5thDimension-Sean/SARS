// Display-only filter for the published exploratory difference image. It hides pixels whose colour is close to
// the near-white "no difference" colour. It works on colour strength, NOT decibels, and never produces a number:
// per the project rules no dB value may be derived from a displayed PNG.

/** 0 for pure white (no colour), up to 1 for fully saturated blue or red. */
export function changeStrength(r: number, g: number, b: number): number {
  return 1 - Math.min(r, g, b) / 255;
}

/** Makes pixels weaker than `threshold` fully transparent, in place. Returns how many pixels remain visible. */
export function hideWeakChanges(rgba: Uint8ClampedArray, threshold: number): number {
  if (!(threshold >= 0 && threshold <= 1)) throw new Error("Threshold must be between 0 and 1");
  let kept = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    if (changeStrength(rgba[i], rgba[i + 1], rgba[i + 2]) < threshold) rgba[i + 3] = 0;
    else kept++;
  }
  return kept;
}

/** Decodes the published PNG, hides weak pixels and returns an object URL for the filtered picture (caller revokes it). */
export async function filteredDifferenceUrl(source: string, threshold: number): Promise<string> {
  const response = await fetch(source, { credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`Difference image unavailable (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    hideWeakChanges(image.data, threshold);
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), "image/png"));
    return URL.createObjectURL(blob);
  } finally { bitmap.close(); }
}

// ---------------------------------------------------------------------------------------------------------------
// Blended change layer. Instead of painting every faint pixel, group strongly coloured pixels into soft-edged areas
// and leave everything else fully transparent, so the radar underneath stays readable. Like the filter above this is a
// DISPLAY transform of the published difference picture: it uses colour strength, produces no number, and is not a
// detection, a flood map or a damage map.

export interface BlendOptions {
  /** 0.1 to 0.9: minimum colour strength that counts as changed. */
  threshold: number;
  /** Smoothing radius in pixels. Isolated single-pixel speckle disappears; neighbouring changed pixels fuse into areas. */
  radius?: number;
  /** Strongest opacity of the overlay, 0 to 1. */
  maxAlpha?: number;
}
export const INCREASE_RGB = [224, 58, 46] as const; // later date returned more power
export const DECREASE_RGB = [47, 139, 255] as const; // later date returned less power

function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), span = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / span;
      sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}
const soft = (v: number, lo: number, hi: number) => { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

/** Returns a new RGBA buffer holding only the blended change areas. The input is never modified. */
export function blendChanges(rgba: Uint8ClampedArray, width: number, height: number, options: BlendOptions): { data: Uint8ClampedArray<ArrayBuffer>; areaFraction: number } {
  const { threshold, radius = 2, maxAlpha = 0.8 } = options;
  if (!(threshold >= 0 && threshold <= 1)) throw new Error("Threshold must be between 0 and 1");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error("Image size does not match its pixels");
  if (!(radius >= 1 && Number.isInteger(radius))) throw new Error("Radius must be a positive whole number of pixels");
  const up = new Float32Array(width * height), down = new Float32Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    if (rgba[i + 3] === 0) continue; // masked or no data never counts as change
    if (changeStrength(rgba[i], rgba[i + 1], rgba[i + 2]) < threshold) continue;
    if (rgba[i] >= rgba[i + 2]) up[p] = 1; else down[p] = 1;
  }
  const bu = boxBlur(up, width, height, radius), bd = boxBlur(down, width, height, radius);
  const data = new Uint8ClampedArray(new ArrayBuffer(rgba.length));
  let shown = 0;
  for (let p = 0; p < width * height; p++) {
    const useUp = bu[p] >= bd[p], density = useUp ? bu[p] : bd[p];
    // The area must be locally dense (not a lone speckle) and must not sit on a masked pixel.
    const a = soft(density, 0.42, 0.72) * maxAlpha;
    if (a <= 0.004 || rgba[p * 4 + 3] === 0) continue;
    const [r, g, b] = useUp ? INCREASE_RGB : DECREASE_RGB;
    data.set([r, g, b, Math.round(a * 255)], p * 4);
    shown++;
  }
  return { data, areaFraction: shown / (width * height) };
}

/** Decodes the published difference PNG and returns an object URL for the blended change layer (caller revokes it). */
export async function blendedChangeUrl(source: string, options: BlendOptions): Promise<string> {
  const response = await fetch(source, { credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error(`Difference image unavailable (${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = blendChanges(image.data, canvas.width, canvas.height, options);
    context.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), "image/png"));
    return URL.createObjectURL(blob);
  } finally { bitmap.close(); }
}
