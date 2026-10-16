/** Editorial study-site metadata. Coordinates and hotspot IDs must match sample-data.json.
 * Context photos are NOT SAR imagery; captions and sources must remain visible.
 */
export interface StudySite {
  slug: string;
  hotspotId: string;
  name: string;
  region: string;
  tag: "WETLANDS" | "FORESTS" | "FAULTS";
  prompt: string;
  headline: string;
  stakes: string;
  humanQuestion: string;
  radarCanShow: string;
  caution: string;
  impact: string[];
  exercises: string[];
  contextImage: string;
  contextCredit: string;
  contextSource: string;
  theme: "water" | "forest" | "fault";
}

export const studySites: StudySite[] = [
  {
    slug: "everglades",
    hotspotId: "W-01",
    name: "Everglades",
    region: "Florida, United States",
    tag: "WETLANDS",
    prompt: "When water moves, landscapes change.",
    headline: "What changes in the wetlands that protect communities and wildlife?",
    stakes: "Wetlands connect water, habitats, and nearby communities. Understanding where surface conditions shift can help frame better questions about ecosystem management.",
    humanQuestion: "If an area becomes wetter or drier, what might that mean for the people, ecosystems, and wildlife depending on it?",
    radarCanShow: "Repeated HH/HV measurements can reveal differences in radar backscatter. Investigate whether these differences align with changing water or vegetation conditions.",
    caution: "A backscatter change is not a confirmed flood or wetland loss measurement. Water level, soil moisture, growth, and acquisition geometry all affect the signal.",
    impact: ["Freshwater ecosystems", "Habitat restoration", "Water management"],
    exercises: ["Compare two acquisition dates", "Toggle HH versus HV", "Inspect the signal distribution and source notes"],
    contextImage: "https://assets.science.nasa.gov/dynamicimage/assets/science/esd/multimedia/images-of-change/Everglades_Comb_1.jpg",
    contextCredit: "NASA Earth Observatory imagery of the Everglades (context only, not SAR-Waltz measurements)",
    contextSource: "https://science.nasa.gov/earth/everglades-national-park-restoration-florida/",
    theme: "water",
  },
  {
    slug: "sundarbans",
    hotspotId: "W-02",
    name: "Sundarbans",
    region: "India / Bangladesh delta",
    tag: "WETLANDS",
    prompt: "A coastline is more than a boundary.",
    headline: "How can we follow change where land, water, and mangroves meet?",
    stakes: "Mangrove landscapes support biodiversity and coexist with communities exposed to changing coastal conditions. Repeat observations help investigators decide where additional evidence is needed.",
    humanQuestion: "How might changes around tidal channels and mangroves matter to coastal livelihoods and storm resilience?",
    radarCanShow: "Radar can observe surface scattering through many cloudy conditions. Compare potential water-and-vegetation response changes across acquisitions.",
    caution: "Different tides and seasonal moisture can create backscatter differences. The dashboard alone does not identify erosion, mangrove loss, or storm damage.",
    impact: ["Coastal resilience", "Mangrove habitat", "Community livelihoods"],
    exercises: ["Review the time between passes", "Compare polarizations", "Write down multiple possible explanations for a signal change"],
    contextImage: "https://ocean.si.edu/sites/default/files/styles/facebook_twitter_card_image/public/2023-11/SundarbansNASA.jpg.webp?itok=XkfyIwOt",
    contextCredit: "NASA imagery via Smithsonian Ocean (context only, not SAR-Waltz measurements)",
    contextSource: "https://ocean.si.edu/ecosystems/coasts-shallow-water/sundarbans-space",
    theme: "water",
  },
  {
    slug: "rondonia",
    hotspotId: "F-01",
    name: "Rondônia",
    region: "Brazilian Amazon",
    tag: "FORESTS",
    prompt: "A forest is a living system.",
    headline: "Can repeated radar observations help flag where a forest may be changing?",
    stakes: "Forests influence ecosystems, the water cycle, and livelihoods. Monitoring disturbances can help focus follow-up work where it is most relevant.",
    humanQuestion: "What happens when a landscape changes faster than field researchers can visit every location?",
    radarCanShow: "HH/HV time series can highlight scattering shifts that might warrant investigation for vegetation disturbance or moisture effects.",
    caution: "Forest loss cannot be established from a backscatter threshold alone. Optical data, land-cover validation, and seasonal context are needed.",
    impact: ["Forest habitat", "Land-use planning", "Ecosystem monitoring"],
    exercises: ["Use the chronological acquisitions", "Look for signal distribution shifts", "Separate a radar anomaly from a verified clearing"],
    contextImage: "https://svs.gsfc.nasa.gov/vis/a010000/a011000/a011061/Rondonia_1986_1024x576.jpg",
    contextCredit: "NASA Scientific Visualization Studio historical Landsat imagery (context only; from 1986)",
    contextSource: "https://svs.gsfc.nasa.gov/11061",
    theme: "forest",
  },
  {
    slug: "tapajos",
    hotspotId: "F-02",
    name: "Tapajós",
    region: "Pará, Brazil",
    tag: "FORESTS",
    prompt: "Rivers and forests share one story.",
    headline: "What can a change in radar signal tell us near the forest frontier?",
    stakes: "At the meeting of river corridors and forest landscapes, environmental change can affect habitats and regional land management. Radar provides an additional view for investigation.",
    humanQuestion: "How can scientists recognize candidate changes across a large landscape without overclaiming their cause?",
    radarCanShow: "Repeated radar backscatter may help highlight changing scattering patterns across vegetated land, river edges, and other surfaces.",
    caution: "Radar backscatter is sensitive to water, vegetation structure, and acquisition conditions. A single difference cannot prove deforestation.",
    impact: ["River-adjacent habitats", "Forest monitoring", "Landscape stewardship"],
    exercises: ["Compare two timeline points", "Inspect HH and HV separately", "Discuss what ground truth would be required"],
    contextImage: "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/154000/154708/brazil_oli_20240923_v2.jpg/jcr%3Acontent/renditions/cq5dam.web.1280.1280.jpeg",
    contextCredit: "NASA Earth Observatory Landsat imagery of Pará (context only; 2024)",
    contextSource: "https://science.nasa.gov/earth/earth-observatory/from-forest-to-field-in-para-154708/",
    theme: "forest",
  },
  {
    slug: "parkfield",
    hotspotId: "E-01",
    name: "Parkfield",
    region: "California, United States",
    tag: "FAULTS",
    prompt: "Sometimes the ground moves without warning.",
    headline: "How do radar phase measurements reveal subtle ground movement?",
    stakes: "Measuring deformation helps researchers understand tectonic processes and how the Earth's surface changes near faults.",
    humanQuestion: "What would it mean to measure small changes in the ground across a fault using observations from space?",
    radarCanShow: "Interferometric products such as GUNW can support line-of-sight displacement and phase analysis. This scenario currently demonstrates those concepts with fictional values.",
    caution: "This project's current Python pipeline processes GCOV backscatter, not GUNW displacement. The Parkfield visual is a simulated teaching scenario until real interferometric processing is integrated.",
    impact: ["Ground motion research", "Geologic hazards", "Infrastructure awareness"],
    exercises: ["Switch between phase and displacement views", "Inspect the displacement profile", "Review the acquisition interval and interpret cautiously"],
    contextImage: "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/4000/4874/parkfield_lrg.jpg",
    contextCredit: "NASA Earth Observatory shaded-relief image of Parkfield (context only, not SAR deformation)",
    contextSource: "https://science.nasa.gov/earth/earth-observatory/parkfield-earthquake-4874/",
    theme: "fault",
  },
];

export function getStudySite(slug: string): StudySite | undefined {
  return studySites.find((site) => site.slug === slug);
}
