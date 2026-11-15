import rawCatalog from "./research-catalog.json" with { type: "json" };

export type EvidenceKind = "published-change" | "published-scene" | "official-browse" | "candidate";
export interface ResearchImage {
  kind: "image"; src: string; sourceUrl: string; label: string; date: string | null;
  credit: string; defer: boolean; polarization?: "HH" | "HV";
}
export interface ResearchStudy {
  id: string; title: string; country: string; region: string; theme: string;
  evidence: EvidenceKind; gallery: "pair" | "polarization-pair" | "sequence" | "single" | "pending";
  period: string; observationDates: string[]; event: string; story: string;
  limitations: string[]; nextStep: string; sources: { label: string; url: string }[];
  media: ResearchImage[];
  video: { src: string; label: string; credit: string; note: string } | null;
  archive: { dates: string[]; note: string } | null;
  status: "BLOCKED"; scientificClearance: "EXPLORATORY_NOT_CLEARED"; measurements: null;
}
export interface ResearchCatalog {
  schemaVersion: "1.0"; title: string; updatedUtc: string;
  status: "BLOCKED"; scientificClearance: "EXPLORATORY_NOT_CLEARED"; measurements: null;
  studies: ResearchStudy[];
}
const HOSTS = new Set([
  "science.nasa.gov", "assets.science.nasa.gov", "svs.gsfc.nasa.gov",
  "www.jpl.nasa.gov", "d2pn8kiwq2w21t.cloudfront.net", "cmr.earthdata.nasa.gov",
  "bhoonidhi.nrsc.gov.in", "www.ct.ingv.it", "www.bom.gov.au",
]);
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const blocked = (v: Record<string, unknown>) => v.status === "BLOCKED"
  && v.scientificClearance === "EXPLORATORY_NOT_CLEARED" && v.measurements === null;
export function safeResearchSource(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && HOSTS.has(u.hostname) && !u.username && !u.password && !u.port && !u.search && !u.hash;
  } catch { return false; }
}
export function safeResearchMedia(value: unknown): value is string {
  return typeof value === "string" && (/^\/research-media\/[a-zA-Z0-9_/-]+\.(?:png|jpg|jpeg)$/.test(value)
    || (safeResearchSource(value) && /\.(?:png|jpg|jpeg|gif|mp4)$/.test(new URL(value).pathname)));
}
function datesValid(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(date)
    && value.every((d, i) => i === 0 || d > value[i - 1]);
}
export function validateResearchCatalog(value: unknown): ResearchCatalog {
  if (!rec(value) || value.schemaVersion !== "1.0" || !date(value.updatedUtc) || !blocked(value)
    || !text(value.title) || !Array.isArray(value.studies) || !value.studies.length) throw new Error("Invalid research catalog");
  const ids = new Set<string>();
  for (const s of value.studies) {
    if (!rec(s) || !text(s.id) || !/^[a-z][a-z0-9-]*$/.test(s.id) || ids.has(s.id)
      || !blocked(s) || !datesValid(s.observationDates)) throw new Error("Invalid study identity, dates or scientific status");
    ids.add(s.id);
    const keys = new Set(["id", "title", "country", "region", "theme", "evidence", "gallery", "period", "observationDates", "event", "story", "limitations", "nextStep", "sources", "media", "video", "archive", "status", "scientificClearance", "measurements"]);
    if (Object.keys(s).some(k => !keys.has(k))) throw new Error("Unrecognized research field; no quantitative results are permitted");
    for (const k of ["title", "country", "region", "theme", "period", "event", "story", "nextStep"]) {
      if (!text(s[k])) throw new Error("Missing research description");
    }
    if (!["published-change", "published-scene", "official-browse", "candidate"].includes(String(s.evidence))
      || !["pair", "polarization-pair", "sequence", "single", "pending"].includes(String(s.gallery))) throw new Error("Unknown evidence or gallery type");
    if (!Array.isArray(s.limitations) || !s.limitations.length || !s.limitations.every(text)
      || !Array.isArray(s.sources) || !s.sources.length || !s.sources.every((x: unknown) =>
        rec(x) && text(x.label) && safeResearchSource(x.url))) throw new Error("Missing limitations or unsafe research source");
    if (!Array.isArray(s.media) || !s.media.every((m: unknown) => rec(m) && m.kind === "image"
      && safeResearchMedia(m.src) && safeResearchSource(m.sourceUrl) && text(m.label) && text(m.credit)
      && typeof m.defer === "boolean" && (m.date === null || (date(m.date) && (s.observationDates as string[]).includes(m.date)))
      && (m.polarization === undefined || m.polarization === "HH" || m.polarization === "HV"))) throw new Error("Unsafe or mismatched research media");
    if (s.video !== null && (!rec(s.video) || !safeResearchMedia(s.video.src)
      || !String(s.video.src).endsWith(".mp4") || !text(s.video.label) || !text(s.video.credit)
      || !text(s.video.note))) throw new Error("Invalid publisher video");
    if (s.archive !== null && (!rec(s.archive) || !datesValid(s.archive.dates) || !text(s.archive.note))) throw new Error("Invalid archived study");
    if (s.evidence === "candidate" && (s.gallery !== "pending" || s.media.length || s.observationDates.length || s.video !== null)) {
      throw new Error("Unverified candidate cannot claim NISAR observations or imagery");
    }
    if (s.gallery === "pair") {
      if (s.evidence !== "published-change" || s.observationDates.length !== 2 || s.media.length !== 2
        || !s.media.every((m: ResearchImage, i: number) => m.date === (s.observationDates as string[])[i])) throw new Error("Published pair dates do not match");
    }
    if (s.gallery === "polarization-pair") {
      if (s.evidence !== "official-browse" || s.observationDates.length !== 2 || s.media.length !== 4) throw new Error("Invalid browse pair");
      for (const d of s.observationDates) for (const p of ["HH", "HV"]) {
        if (s.media.filter((m: ResearchImage) => m.date === d && m.polarization === p).length !== 1) throw new Error("Missing date/polarization browse image");
      }
    }
    if (s.gallery === "sequence" && (s.evidence !== "published-change" || !s.video || !s.media.length)) throw new Error("Missing publisher sequence");
    if (s.gallery === "single" && (!s.media.length || s.evidence !== "published-scene")) throw new Error("Invalid published scene");
    if (s.evidence === "published-scene" && s.observationDates.length > 1) throw new Error("Single scene cannot claim a temporal pair");
  }
  return value as unknown as ResearchCatalog;
}
export const RESEARCH_CATALOG = validateResearchCatalog(rawCatalog);
export const RESEARCH_STUDIES = RESEARCH_CATALOG.studies;
export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  "published-change": "NASA-documented change",
  "published-scene": "Published NISAR scene",
  "official-browse": "Official scene browse",
  candidate: "Candidate · NISAR pair unverified",
};
export function researchIdFromHash(hash: string): string {
  const id = hash.replace(/^#/, "");
  return RESEARCH_STUDIES.some(s => s.id === id) ? id : "hubbard";
}
export function researchMediaUrl(src: string, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""): string {
  if (!safeResearchMedia(src)) throw new Error("Unsafe research media");
  return src.startsWith("/") ? basePath.replace(/\/$/, "") + src : src;
}
export function researchSummary(study: ResearchStudy) {
  return { schemaVersion: "1.0", purpose: "Internal research preview; publisher imagery and browse assets only",
    updatedUtc: RESEARCH_CATALOG.updatedUtc, ...study,
    quantitativeDifferenceAvailable: false, measurements: null };
}
