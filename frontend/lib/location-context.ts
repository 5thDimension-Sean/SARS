import type { StudyConfig } from "./investigation.ts";

/** Place-specific hypotheses are context, never causal conclusions about radar pixels. */
export const SITE_CONTEXT: Record<StudyConfig["id"], {
  setting: string; canSuggest: string; cannotConfirm: string; nextEvidence: string;
}> = {
  everglades: {
    setting: "The Florida Everglades contain shallow water, marsh vegetation and a changing wetland surface. NISAR can observe radar return through clouds and at night.",
    canSuggest: "Water depth, flooded vegetation and surface roughness can influence HH and HV radar returns.",
    cannotConfirm: "A brighter or darker pixel does not prove that a particular spot flooded, dried out, or lost vegetation.",
    nextEvidence: "Compare the radar dates with local water-level stations, rainfall and wetland observations.",
  },
  louisiana: {
    setting: "The lower Mississippi Delta contains river channels, marsh, open water and sediment-built coastal land.",
    canSuggest: "Water coverage, wet soil, vegetation and river-surface conditions can change the radar response.",
    cannotConfirm: "These two radar observations cannot by themselves quantify sediment gain, land loss or wetland disappearance.",
    nextEvidence: "Check measured water levels and dated shoreline or wetland maps for the same footprint.",
  },
  california: {
    setting: "The Big Sur study covers steep terrain near the 2026 Plaskett Fire area; the image footprint includes mixed slopes and land cover.",
    canSuggest: "Changes in vegetation, moisture, terrain viewing geometry and surface roughness can affect radar backscatter.",
    cannotConfirm: "The change image is not a validated fire perimeter, burn severity measurement or landslide map.",
    nextEvidence: "Compare with official dated fire boundaries, optical imagery and terrain masks.",
  },
  hawaii: {
    setting: "The Kīlauea summit area contains a volcanic caldera, rough lava terrain and complex radar viewing angles.",
    canSuggest: "Surface roughness, moisture, geometry and volcanic-surface changes can all alter radar intensity.",
    cannotConfirm: "The paired radar returns do not establish that fresh lava appeared or that an eruption caused the difference.",
    nextEvidence: "Check dated USGS volcano observations, mapped lava boundaries and acquisition geometry.",
  },
  iowa: {
    setting: "The Ames study contains developed land alongside fields and other mixed land cover, not just crops.",
    canSuggest: "Plant structure, soil moisture and built surfaces can affect radar strength between dates.",
    cannotConfirm: "A radar decrease does not independently establish a harvest, crop loss or construction activity.",
    nextEvidence: "Compare with dated crop maps, field boundaries and local precipitation records.",
  },
  rodanthe: {
    setting: "Rodanthe sits on the narrow Outer Banks barrier islands, where coastal storms, waves and shoreline movement matter.",
    canSuggest: "Ocean waves, wet sand, tide and surface roughness can change radar returns, even when land has not eroded.",
    cannotConfirm: "Neither the 12-day nor the separately evaluated 96-day NISAR radar difference alone measures shoreline retreat.",
    nextEvidence: "Use Dare County's dated aerial shoreline comparisons to inspect real land-boundary movement; keep it separate from radar intensity.",
  },
  etna: {
    setting: "Mount Etna on Sicily is an active stratovolcano. These NISAR scenes bracket the August 6, 2026 eruptive episode, over a 24-day interval that also includes other possible surface changes.",
    canSuggest: "Fresh surface roughness, moisture, ash, vegetation and viewing geometry can change L-band radar intensity near the volcano.",
    cannotConfirm: "Differences in HH or HV radar brightness do not independently prove a new lava flow, identify a burn area, or show where eruption damage occurred.",
    nextEvidence: "Compare with dated official volcanic observations, mapped lava boundaries, terrain-aware viewing geometry and optical imagery from the same period.",
  },
  amazon: {
    setting: "Mamirauá is part of the Amazon River floodplain, with channels, flooded forest and seasonal water-level variation.",
    canSuggest: "Water beneath vegetation, river stage and forest structure can produce different radar returns.",
    cannotConfirm: "A backscatter change is not automatically a mapped flood, a changed river channel or lost forest.",
    nextEvidence: "Cross-check river-gauge levels, seasonal precipitation and independently dated flood or forest-cover maps.",
  },
  hubbard: {
    setting: "Hubbard Glacier is a tidewater glacier in the St. Elias Mountains. These NISAR scenes bracket the December 6, 2025 earthquake, but the product is BETA maturity and other changes occurred in the interval.",
    canSuggest: "Snow and ice surface state, melt, slope movement and viewing geometry can change L-band radar intensity.",
    cannotConfirm: "Backscatter change alone does not show avalanche deposits, glacier motion or earthquake damage.",
    nextEvidence: "Compare with NASA's published earthquake analysis, optical imagery and terrain-aware viewing geometry from the same dates.",
  },
  sossusvlei: {
    setting: "Sossusvlei is a dune and salt-pan landscape in the Namib Desert, crossed by the ephemeral Tsauchab river.",
    canSuggest: "Surface moisture, dune surface roughness and rare runoff can change L-band radar intensity.",
    cannotConfirm: "A backscatter change is not automatically rainfall, flooding or dune movement.",
    nextEvidence: "Cross-check rainfall records, river-flow reports and dated optical imagery for the same 12 days.",
  },
  padma: {
    setting: "The Padma is a large braided river in Bangladesh whose channels, banks and sandbars shift with water level and sediment.",
    canSuggest: "River stage, wet sand, vegetation and bank roughness can change L-band radar intensity between dates.",
    cannotConfirm: "A 12-day backscatter change does not measure riverbank erosion, which needs mapped banklines over longer periods.",
    nextEvidence: "Compare with river-gauge levels and independently dated optical bankline maps, such as the Landsat comparison on the Padma erosion page.",
  },
};
