export const COORDINATE_STARTERS = [
  { name: "Everglades, Florida", latitude: 25.5, longitude: -80.8 },
  { name: "Louisiana Delta", latitude: 29.21, longitude: -89.41 },
  { name: "Big Sur, California", latitude: 35.9, longitude: -121.42 },
  { name: "Kilauea, Hawai?i", latitude: 19.41, longitude: -155.27 },
  { name: "Rodanthe, North Carolina", latitude: 35.585, longitude: -75.465 },
  { name: "Mamirau�, Amazon River", latitude: -3.19, longitude: -64.88 },
  { name: "Hubbard Glacier, Alaska", latitude: 60.1, longitude: -139.3 },
  { name: "Sossusvlei, Namibia", latitude: -24.75, longitude: 15.3 },
  { name: "Mount Etna, Sicily", latitude: 37.75, longitude: 15.0 },
  { name: "Padma River, Bangladesh", latitude: 23.75, longitude: 90.05 },
] as const;

export function validCoordinate(latitude: string, longitude: string): boolean {
  if (!latitude.trim() || !longitude.trim()) return false;
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return false;
  const dx = 0.018 / Math.cos(lat * Math.PI / 180);
  return lon - dx >= -180 && lon + dx <= 180;
}

export function processingEndpoint(value: string, development: boolean): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return "";
    const local = development && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "";
    return url.href.replace(/\/$/, "");
  } catch { return ""; }
}

export const JOB_STATUSES = ["idle", "connecting", "queued", "searching", "downloading", "processing", "generating", "ready", "unavailable", "failed"] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export const isJobStatus = (value: unknown): value is JobStatus => JOB_STATUSES.some(s => s === value);
