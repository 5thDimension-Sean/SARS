# Worldwide NISAR change-story shortlist

Research checked 2026-11-15. These are ideas for the next internal studies, not completed exports or clearance decisions. A published NISAR observation establishes a useful lead; our own asset provenance, product compatibility and scientific QA still need checking. No new location has been added to the website.

## Best next additions

1. **Krasheninnikov, Kamchatka, Russia — expanding lava flows.** NASA published a 17-frame NISAR sequence covering December 25, 2025 through August 17, 2026. This is the strongest volcano story located: a visible lava field develops over time. The sequence shows ongoing activity after eruption onset, not a pre-eruption baseline. Recover its exact granules, consistent orbit and fixed display scales before producing our own numerical series. [NASA article](https://www.nasa.gov/missions/nisar/us-india-satellite-captures-time-lapse-video-of-volcanic-eruption/) · [NASA animation and downloads](https://svs.gsfc.nasa.gov/5675)

2. **Limpopo/Incomati basins, Mozambique — extensive flooding.** NASA provides NISAR GCOV before/after visualizations for January 5 and January 17, 2026, including Chokwe and Macia. This is a strong match for the existing backscatter workflow and has publicly documented event context. The published maps and classifications remain NASA products; we have not reproduced their flood measurements. [NASA imagery, downloadable composites and open-water views](https://svs.gsfc.nasa.gov/5661)

3. **Hubbard Glacier — use the earthquake-spanning pair.** NASA's documented avalanche/landslide comparison uses November 26 and December 8, 2025, spanning the December 6 earthquake. Its imagery was prepared from GSLC. The October 2026 GCOV previews imported here are a different pair and cannot be labeled as that earthquake's before/after observations. Investigate the older pair separately; retain the existing October files and their blocked status. [NASA before/after images](https://science.nasa.gov/earth/earth-observatory/landslide-and-avalanche-debris-litter-hubbard-glacier/)

## Geographic options and evidence status

| Region | Location / idea | What is actually established | Next decision |
| --- | --- | --- | --- |
| Russia / northern Asia | Krasheninnikov, Kamchatka | NASA-published NISAR lava-growth time series | First volcano choice |
| Africa | Limpopo/Incomati, Mozambique | NASA-published NISAR flood pair, January 5/17, 2026 | First flood choice |
| Africa | Hayli Gubbi / Erta Ale, Ethiopia | Research paper uses NISAR and Sentinel-1 to study November 2025 volcanic deformation | More complex interferometry study; metadata issue below |
| South Asia | Sri Lanka, Cyclone Ditwah | ISRO gallery explicitly lists EOS-04 C-band and NISAR S-band imagery dated December 2, 2025 | Inspect the panel and locate a same-sensor, same-band pre/post pair; do not treat the mixed-sensor panel as one NISAR difference |
| Southeast Asia | Aceh / North Sumatra, Cyclone Senyar | NASA documents destructive November 2025 flooding using Landsat; NISAR pair has not been verified | Candidate for a new NISAR catalog search |
| Southeast Asia | Mount Rinjani, Indonesia | ISRO publishes a July 9, 2026 NISAR S-band GCOV volcanic-terrain scene | Confirmed imagery, not proof of a new eruption or temporal change |
| Antarctica | Nunatak Zaterjavshijsja / Rennick Glacier | NASA publishes fractured-ice imagery at the nunatak; ISRO lists Rennick Glacier | Strong visual geography; no rapid-calving or dramatic temporal event established here |
| Europe | Etna, Sicily, Italy | INGV documents an eruption starting December 24, 2025 and a new lava fissure January 1, 2026 | Candidate; verify NISAR coverage before claiming NISAR documented it |
| Australia | Queensland, Cyclone Koji flood footprint | Bureau of Meteorology documents January 2026 flooding; no NISAR flood pair verified in this review | Candidate for a new catalog search |
| Australia | Mildura / Murray River | ISRO gallery lists a NISAR S-band scene at Mildura | Confirmed location imagery, not a verified flood event |
| South America | La Guaira / Caracas, Venezuela | NASA publishes NISAR earthquake displacement maps spanning June 24, 2026 | Strong global extension using a separate GUNW/displacement workflow |

## Sources and technical limits

- [ISRO's NISAR image gallery](https://bhoonidhi.nrsc.gov.in/NISAR/) lists Cyclone Ditwah, Rennick Glacier, Mildura and other scenes. These are S-band examples. The current project pipeline targets L-band frequency-A GCOV; never mix L-band and S-band values or unverified cross-sensor dates into one quantitative change layer.
- [ISRO S-band release and Rinjani product identifier](https://www.isro.gov.in/NISARS_Band_SAR_Data_Products_Release.html). Rinjani is terrain/ecosystem imagery, not an eruption time series.
- [NASA Antarctic nunatak image](https://www.jpl.nasa.gov/images/pia26617-nisars-l-band-radar-reveals-hummingbird-in-antarctica/). Its crevasse contrast is spatial structure; that single scene does not demonstrate rapid change.
- [Hayli Gubbi / Erta Ale paper, DOI 10.1016/j.geog.2026.06.002](https://doi.org/10.1016/j.geog.2026.06.002). The accessible paper text lists a NISAR acquisition on November 22, **2024**, before the July 2025 launch. This is an unresolved date inconsistency, not a usable acquisition specification. Verify the original CMR records and any correction with the authors before selecting a pair. Its deformation uses RSLC interferometry and complementary Sentinel-1 views; no displacement can be inferred from GCOV PNG brightness.
- [NASA's Senyar flood report](https://science.nasa.gov/earth/earth-observatory/senyar-swamps-sumatra/) explicitly uses Landsat 9. The event is real; its NISAR coverage is still unverified.
- [INGV's Etna eruption update](https://www.ct.ingv.it/index.php/formazione-e-divulgazione/news/417-etna-aggiornamento-attivita-eruttiva) supplies event context, not evidence that NISAR observed the eruption.
- [Bureau of Meteorology: Cyclone Koji, January 7–14, 2026](https://www.bom.gov.au/cyclone/history/Koji_2026.shtml) and [Fitzroy catchment flood context](https://www.bom.gov.au/qld/flood/brochures/fitzroy/fitzroy.shtml) support the Queensland event candidate.
- [NASA's Venezuela earthquake observations](https://science.nasa.gov/earth/earth-observatory/where-venezuelas-earthquakes-shifted-the-ground/) and [NASA response portal with GUNW description](https://science.data.nasa.gov/disasters/news-events-stories/venezuela-earthquake-jun-2026) support an additional documented displacement story.

## Recommended order

Start with **Russia + Mozambique**, then inspect the event-spanning Hubbard pair. For wider geographic coverage, investigate Sri Lanka and Antarctica next, keeping single-scene structure separate from measured temporal change. Run targeted NISAR availability searches for Etna, Queensland and Sumatra before committing them as documented NISAR event studies. Exact granules, ROIs and comparable pre/post products are not yet selected for these new cases.

Do not describe Sossusvlei's October browse contrast or Hubbard's October imagery as a dramatic measured event merely because the terrain is visually striking. Preserve the original eight browse files, their provenance, and BLOCKED / EXPLORATORY_NOT_CLEARED status. The four requested quantitative difference images remain pending numerical data and validation.
