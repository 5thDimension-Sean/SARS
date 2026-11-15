// Curated, searchable answers. Static text only: nothing is generated, so nothing can be invented.
export interface FaqItem { id: string; question: string; answer: string; keywords: string[] }

export const FAQ: readonly FaqItem[] = [
  { id: "what", question: "What am I looking at?", keywords: ["nisar", "sar", "radar", "image", "photo"],
    answer: "Radar measurements from NASA's NISAR satellite on two dates. Radar sends its own microwaves and records what comes back, so it works through cloud and at night. The pictures are intensity maps, not photographs." },
  { id: "hhhv", question: "What are HH and HV?", keywords: ["hh", "hv", "polarization", "polarisation", "channel"],
    answer: "Two ways of sending and receiving the radar wave. HH sends and receives horizontally; HV sends horizontally and receives vertically. HV is much weaker and responds differently to the surface, so compare each channel only with itself across dates." },
  { id: "db", question: "What is a decibel (dB)?", keywords: ["db", "decibel", "backscatter", "gamma", "log", "scale", "units"],
    answer: "A log scale for returned power. Every −10 dB is ten times less power, and about 3 dB is a doubling or halving. Differences well under 1 dB are small, and a number alone does not establish significance." },
  { id: "difference", question: "What is the difference map, and why does it look speckled?", keywords: ["difference", "map", "speckle", "noise", "red", "blue", "pixel", "change"],
    answer: "It subtracts the earlier date from the later one, pixel by pixel, in dB. Blue means lower on the later date, red higher, near-white about the same. Pixel-to-pixel variation is large compared with the typical shift, which gives the grainy look. The Changed pixels filter only hides faint colors; it is not a measurement." },
  { id: "regions", question: "Why these three regions? Are they typical?", keywords: ["region", "regions", "selection", "typical", "window"],
    answer: "They were found by an exploratory search for pixel-level differences, using 80 by 80 pixel windows. They illustrate variation and are not a random sample, so they are not typical of the whole scene." },
  { id: "flood", question: "Does this show flooding, fire damage or vegetation loss?", keywords: ["flood", "flooding", "fire", "burn", "burned", "damage", "vegetation", "loss", "wildfire", "plaskett"],
    answer: "No. Radar backscatter changes with roughness, moisture, vegetation structure, noise and processing. A difference between two dates does not say which of these happened, and independent evidence would be needed. The California photographs document the incident only; they are not matched to the radar." },
  { id: "qa", question: "What does “not cleared for quantitative analysis” mean?", keywords: ["qa", "quality", "cleared", "fail", "unverified", "exploratory", "validated", "confidence"],
    answer: "The official product quality checks have not been passed or reviewed for these scenes, and noise or banding has not been ruled out. Every number here is exploratory. The Verify section lists each check with its status; it is a status report, not a confidence score." },
  { id: "source", question: "Where does the data come from?", keywords: ["data", "source", "nasa", "asf", "gcov", "provisional", "download", "granule", "doi"],
    answer: "NASA NISAR Level-2 GCOV products (provisional) from the ASF DAAC. Each location's granule IDs link to NASA's catalog in the Verify section." },
  { id: "upload", question: "Can I upload my own data?", keywords: ["upload", "own", "hdf5", "h5", "file", "process"],
    answer: "No. Products are processed offline and published as small validated files; this site is static and never receives raw data." },
  { id: "coordinates", question: "Can I enter any latitude, longitude, and date range?", keywords: ["coordinate", "coordinates", "latitude", "longitude", "date", "interval", "coverage", "anywhere"],
    answer: "The Coordinates tool accepts any valid latitude and longitude, then checks whether a published NISAR scene covers that point with both acquisitions inside your selected interval. It does not download raw satellite data or generate an arbitrary new pair. Unsupported places or dates show a clear no-data result." },
  { id: "dates", question: "Why can't I compare any two dates?", keywords: ["date", "dates", "interval", "revisit", "acquisition", "pair", "missing"],
    answer: "Satellites observe a location on particular dates, not continuously. A meaningful radar comparison requires matching coverage, polarization, acquisition geometry, georeferencing, masks, and quality checks. The requested dates may not have a compatible pair." },
  { id: "erosion", question: "Can TANGO measure erosion or shoreline retreat?", keywords: ["erosion", "shoreline", "coast", "coastal", "retreat", "accretion", "usgs"],
    answer: "Not from a two-date backscatter difference alone. Radar returns also change with water level, waves, wetness, roughness and vegetation. For documented U.S. shoreline positions and erosion rates, see the USGS National Shoreline Change Data Publication Catalog and Digital Shoreline Analysis System. TANGO's exploratory color overlays are not validated erosion measurements." },
  { id: "faint", question: "What does Faint to Strong change?", keywords: ["faint", "strong", "threshold", "contrast", "slider", "filter"],
    answer: "The slider changes which colors from the published exploratory difference image remain visible. Start at Faint to retain weaker visual differences; move toward Strong to suppress weak colors. This is a display filter, not a physical detection threshold or confidence measure." },
  { id: "empty", question: "Why is an area blank, or why is there no result?", keywords: ["blank", "empty", "transparent", "no", "coverage", "missing", "masked"],
    answer: "Some pixels are masked or outside valid scene coverage. A missing comparison means no compatible published data were found for the requested point and interval; it does not mean no environmental change occurred." },
  { id: "sources-erosion", question: "Where can I get independent evidence of coastal erosion?", keywords: ["usgs", "coastal", "shoreline", "erosion", "evidence", "dataset"],
    answer: "Start with the USGS National Shoreline Change Data Publication Catalog (usgs.gov/centers/whcmsc/science/national-shoreline-change-data-publication-catalog). USGS DSAS (usgs.gov/centers/whcmsc/science/digital-shoreline-analysis-system-dsas) estimates shoreline movement and rates from dated shorelines, with uncertainty. Those data are independent of TANGO's SAR backscatter previews and should be labeled separately." },
  { id: "display", question: "What do the display settings do?", keywords: ["settings", "light", "dark", "motion", "theme", "accessibility", "appearance"],
    answer: "Appearance switches between dark, light or your system setting. Reduced motion turns off animation. Choices are saved on this device only." },
];

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/** Ranks questions by overlapping words; an empty query returns everything in the curated order. */
export function searchFaq(query: string, items: readonly FaqItem[] = FAQ): FaqItem[] {
  // One-letter words ("a", "1") match almost everything, so they are ignored.
  const words = norm(query).filter((w) => w.length > 1);
  if (!words.length) return [...items];
  return items
    .map((item) => {
      const q = norm(item.question), a = norm(item.answer), k = item.keywords;
      let score = 0;
      for (const w of words) {
        if (k.includes(w)) score += 4;
        if (q.includes(w)) score += 3;
        if (a.includes(w)) score += 1;
        else if (w.length > 3 && (a.some((x) => x.startsWith(w)) || q.some((x) => x.startsWith(w)))) score += 1;
      }
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((r) => r.item);
}
