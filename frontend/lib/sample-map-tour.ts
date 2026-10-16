/** Original narrative for a fictional demonstration mapped to real Everglades coordinates.
 * No fictional measurement or event is presented as a NASA observation.
 */
export const TOUR_INTERVAL_MS = 15_000;

export type TourFocus = "extent" | "water" | "vegetation" | "urban" | "change" | "transect" | "timing" | "polarization" | "annotation" | "provenance";

export interface MapTourStep {
  id: number;
  shortLabel: string;
  title: string;
  eyebrow: string;
  description: string;
  tags: string[];
  focus: TourFocus;
  point: readonly [number, number];
  turn: number;
  insight: string;
}

export const mapTourSteps: readonly MapTourStep[] = [
  {
    id: 1, shortLabel: "Study footprint", title: "Start with a location.",
    eyebrow: "GEOGRAPHY / OBSERVATION AREA",
    description: "A radar investigation begins with a clearly defined study area. This illustration is inspired by the Everglades sample scenario; the geometry is a schematic, not a satellite footprint.",
    tags: ["STUDY AREA", "COORDINATES", "SAMPLE"],
    focus: "extent", point: [332, 208], turn: -7,
    insight: "Geographic context comes before interpretation."
  },
  {
    id: 2, shortLabel: "Water channels", title: "Follow the water.",
    eyebrow: "SURFACE RESPONSE / OPEN WATER",
    description: "Smooth open water often returns less radar energy toward the sensor, but the response depends on wind and viewing conditions. Traced blue channels here illustrate what investigators might examine.",
    tags: ["SURFACE ROUGHNESS", "WATER", "SAMPLE"],
    focus: "water", point: [310, 236], turn: -3,
    insight: "Radar darkness alone cannot confirm a flood."
  },
  {
    id: 3, shortLabel: "Wetland canopy", title: "See beyond the surface.",
    eyebrow: "SCATTERING / VEGETATION",
    description: "Marsh and vegetation scatter microwave energy differently from open water. HH and HV can offer complementary clues about the structure and moisture of a wetland landscape.",
    tags: ["VEGETATION", "HH / HV", "SAMPLE"],
    focus: "vegetation", point: [252, 188], turn: 2,
    insight: "Scattering patterns depend on vegetation and acquisition geometry."
  },
  {
    id: 4, shortLabel: "Built environment", title: "Find the human edge.",
    eyebrow: "SETTLEMENTS / INFRASTRUCTURE",
    description: "Buildings and infrastructure can produce strong radar returns or complex double-bounce scattering. Their signal is not interpreted like the signal from water or vegetation.",
    tags: ["INFRASTRUCTURE", "SCATTERING", "SAMPLE"],
    focus: "urban", point: [417, 205], turn: 7,
    insight: "Bright radar pixels do not necessarily identify damage."
  },
  {
    id: 5, shortLabel: "Change candidate", title: "Notice what differs.",
    eyebrow: "TEMPORAL COMPARISON / CANDIDATE CHANGE",
    description: "Comparing two suitable acquisitions can highlight a candidate change in radar response. The amber region is a fictional example—not an observed flooded area or measured habitat loss.",
    tags: ["BEFORE / AFTER", "SIGNAL CHANGE", "SAMPLE"],
    focus: "change", point: [340, 177], turn: 11,
    insight: "A difference identifies a question, not a confirmed cause."
  },
  {
    id: 6, shortLabel: "Profile line", title: "Trace a signal across space.",
    eyebrow: "ANALYSIS / TRANSECT",
    description: "Draw a line through a region to inspect how measurements vary along it. A real signal profile needs calibrated, georeferenced data; the line shown here demonstrates the analysis concept.",
    tags: ["TRANSECT", "MEASUREMENT", "SAMPLE"],
    focus: "transect", point: [322, 214], turn: 5,
    insight: "Visual profiles become measurements only when data supports them."
  },
  {
    id: 7, shortLabel: "Acquisition timing", title: "Time changes everything.",
    eyebrow: "ACQUISITIONS / TEMPORAL SPACING",
    description: "The sample timeline contains multiple acquisition dates. Real comparisons must also check viewing geometry, elapsed time, seasonal changes, and calibration before interpreting differences.",
    tags: ["TIMELINE", "REPEAT VISITS", "SAMPLE"],
    focus: "timing", point: [352, 229], turn: -1,
    insight: "Compare acquisition metadata, not just images."
  },
  {
    id: 8, shortLabel: "HH / HV response", title: "Change the way you listen.",
    eyebrow: "POLARIZATION / DUAL CHANNEL",
    description: "HH and HV polarization measure different scattering responses. Toggling them can reveal structures that are less obvious in a single channel; neither channel alone assigns a cause.",
    tags: ["HH", "HV", "RADAR RESPONSE"],
    focus: "polarization", point: [278, 180], turn: -8,
    insight: "Complementary channels improve investigation, not certainty."
  },
  {
    id: 9, shortLabel: "Region annotation", title: "Mark your investigation.",
    eyebrow: "GEOGRAPHY / AREA OF INTEREST",
    description: "Use geographic polygons, points, lines and measurements to communicate where further analysis is needed. An annotation is not itself a computed flood or disturbance estimate.",
    tags: ["POLYGON", "FIELD NOTES", "GEOJSON"],
    focus: "annotation", point: [348, 192], turn: -3,
    insight: "Keep the selected region reproducible and georeferenced."
  },
  {
    id: 10, shortLabel: "Scientific evidence", title: "Finish with the evidence.",
    eyebrow: "PROVENANCE / VALIDATION",
    description: "A responsible SAR story names the original product, acquisition conditions, processing assumptions and known limitations. This wireframe and its measurements are only demonstration data.",
    tags: ["PROVENANCE", "UNCERTAINTY", "SAMPLE"],
    focus: "provenance", point: [326, 216], turn: 0,
    insight: "A credible conclusion shows what is known—and what remains unproven."
  }
];
