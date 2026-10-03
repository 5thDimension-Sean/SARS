export const displayDate = (iso: string, year = false) =>
  new Date(iso + "T00:00:00Z")
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    })
    .toUpperCase();
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const formatCoordinates = (latitude: number, longitude: number) =>
  `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"} / ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`;
