// Ancillary context layers (population, land cover, vegetation...). These come from an offline pipeline step that
// summarises a published dataset over a study footprint. Nothing here is computed from radar pixels, and nothing is
// shown unless it passes validation: a missing or invalid manifest is a truthful empty state, never a placeholder.

export const ANCILLARY_KINDS = ["population", "land_cover", "vegetation", "other"] as const;
export type AncillaryKind = (typeof ANCILLARY_KINDS)[number];
export interface ClassShare { label: string; fraction: number }
export interface AncillaryLayer {
  id: string; kind: AncillaryKind; title: string; source: string; sourceUrl: string; year: number; version: string | null;
  license: string; resolutionM: number; caveat: string;
  /** Land-cover style summary: share of valid pixels in each class. Absent for continuous layers. */
  classes: ClassShare[] | null;
  /** Continuous summary, such as people per square kilometre. Absent for categorical layers. */
  total: { value: number; unit: string } | null;
  /** Pixels outside the footprint or flagged no-data are excluded; this is the share of the footprint that was valid. */
  validFraction: number;
}

const text = (v: unknown, max: number, name: string): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`Ancillary manifest: "${name}" must be a non-empty string of at most ${max} characters`);
  return v.trim();
};
const finite = (v: unknown, name: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Ancillary manifest: "${name}" must be a finite number`);
  return v;
};

/** Only https links to named hosts: no javascript:, data:, protocol-relative or credentialed URLs. */
export function safeHttpsUrl(v: unknown, name = "sourceUrl"): string {
  const raw = text(v, 500, name);
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`Ancillary manifest: "${name}" is not a valid URL`); }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) throw new Error(`Ancillary manifest: "${name}" must be a plain https link`);
  return u.toString();
}

export function parseAncillary(raw: unknown, studyId: string): AncillaryLayer[] {
  const root = raw as { studyId?: unknown; layers?: unknown } | null;
  if (!root || typeof root !== "object" || root.studyId !== studyId || !Array.isArray(root.layers)) throw new Error("Ancillary manifest does not match this study");
  return root.layers.map((l: Record<string, unknown>, i) => {
    const kind = l.kind as AncillaryKind;
    if (!ANCILLARY_KINDS.includes(kind)) throw new Error(`Ancillary manifest: layer ${i} has an unknown kind`);
    const classes = l.classes == null ? null : (() => {
      if (!Array.isArray(l.classes) || !l.classes.length) throw new Error("Ancillary manifest: classes must be a non-empty list");
      const out = l.classes.map((c: Record<string, unknown>) => {
        const fraction = finite(c.fraction, "fraction");
        if (fraction < 0 || fraction > 1) throw new Error("Ancillary manifest: class fraction outside 0 to 1");
        return { label: text(c.label, 80, "class label"), fraction };
      });
      const sum = out.reduce((a, c) => a + c.fraction, 0);
      if (Math.abs(sum - 1) > 0.02) throw new Error("Ancillary manifest: class fractions must sum to 1");
      return out;
    })();
    const total = l.total == null ? null : (() => {
      const t = l.total as Record<string, unknown>; const value = finite(t.value, "total.value");
      if (value < 0) throw new Error("Ancillary manifest: total must not be negative");
      return { value, unit: text(t.unit, 40, "total.unit") };
    })();
    if (!classes && !total) throw new Error(`Ancillary manifest: layer ${i} has no summary`);
    const validFraction = finite(l.validFraction, "validFraction");
    if (validFraction <= 0 || validFraction > 1) throw new Error("Ancillary manifest: validFraction must be in (0, 1]");
    const year = finite(l.year, "year");
    if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new Error("Ancillary manifest: implausible year");
    const resolutionM = finite(l.resolutionM, "resolutionM");
    if (resolutionM <= 0) throw new Error("Ancillary manifest: resolutionM must be positive");
    return {
      id: text(l.id, 60, "id"), kind, title: text(l.title, 120, "title"), source: text(l.source, 160, "source"), sourceUrl: safeHttpsUrl(l.sourceUrl),
      year, version: l.version == null ? null : text(l.version, 40, "version"), license: text(l.license, 120, "license"), resolutionM,
      caveat: text(l.caveat, 400, "caveat"), classes, total, validFraction,
    };
  });
}
