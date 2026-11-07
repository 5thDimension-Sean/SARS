// Browse imagery is deliberately independent of SampleDataset and numerical science grids.
export const NISAR_LAYER = "NISAR_L2_Geocoded_Polarimetric_Covariance";
export const MATRIX = "GoogleMapsCompatible_Level13";
export const DATES = ["2026-09-30", "2026-10-12"] as const;
export type BrowseDate = (typeof DATES)[number];
export const GRANULES = ["G4342506513-ASF", "G4373929961-ASF"] as const;
export const ATTRIBUTION = '<a href="https://nasa-gibs.github.io/gibs-api-docs/">NASA GIBS / ESDIS</a> · NISAR NASA–ISRO · <a href="https://nisar-docs.asf.alaska.edu/gcov/">ASF DAAC</a>';

export function tileUrl(date: BrowseDate, z: string | number = "{z}", x: string | number = "{x}", y: string | number = "{y}") {
  if (!DATES.includes(date)) throw new Error("Unverified imagery date");
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NISAR_LAYER}/default/${date}/${MATRIX}/${z}/${y}/${x}.png`;
}

// The exact common Web Mercator tile inspected during Phase 1: z=9, x=141, y=218.
const latitude = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / 512))) * 180 / Math.PI;
export const STUDY_BOUNDS: [number, number, number, number] = [141 / 512 * 360 - 180, latitude(219), 142 / 512 * 360 - 180, latitude(218)];

export function hasComparableCoverage(before: Uint8ClampedArray, after: Uint8ClampedArray): boolean {
  if (before.length !== 256 * 256 * 4 || after.length !== before.length) return false;
  let shared = 0;
  const min = [255, 255], max = [0, 0];
  for (let i = 0; i < before.length; i += 4) {
    if (before[i + 3] < 128 || after[i + 3] < 128) continue;
    shared++;
    for (const [index, pixels] of [before, after].entries()) {
      const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      min[index] = Math.min(min[index], brightness);
      max[index] = Math.max(max[index], brightness);
    }
  }
  // This checks display availability only, never measurement quality or scientific confidence.
  return shared / (256 * 256) >= 0.95 && max.every((v, i) => v - min[i] > 12);
}

export async function verifyBrowsePair(signal: AbortSignal): Promise<boolean> {
  const pixels = await Promise.all(DATES.map(async (date) => {
    const response = await fetch(tileUrl(date, 9, 141, 218), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      credentials: "omit",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) {
      throw new Error("NASA imagery request failed");
    }
    const bitmap = await createImageBitmap(await response.blob());
    try {
      if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error("Unexpected tile dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Imagery verification unavailable");
      context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, 256, 256).data;
    } finally { bitmap.close(); }
  }));
  return hasComparableCoverage(pixels[0], pixels[1]);
}
