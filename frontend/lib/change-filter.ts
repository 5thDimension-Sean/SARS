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
