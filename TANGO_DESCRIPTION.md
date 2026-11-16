# TANGO: Dancing with SARs

### Overview

TANGO is a website for exploring data from the NASA–ISRO Synthetic Aperture Radar (NISAR) mission. Radar can observe Earth's surface through clouds and at night, but reading it usually takes specialized software and training. TANGO lets students, researchers, and curious people explore real NISAR measurements on an interactive globe, and learn what a radar difference does and does not prove.

**A visible difference.** On Mount Etna, Sicily (Jul 23 and Aug 16, 2026), the median HH backscatter across our study area is about 0.7 dB higher on the second date, while HV is about 0.4 dB lower. A first guess might be "the volcano changed." TANGO shows why that isn't established: the two polarizations moved in opposite directions, the two numbers are separately calculated medians (not paired-pixel changes), and noise, artifacts and surface conditions can all move backscatter.

**A near-null result.** In the Florida Everglades (Sep 30 and Oct 12, 2026), the median HH backscatter is about −11.9 dB on both dates. The difference is ≈0.02 dB, effectively no change. That neither proves nor rules out flooding or vegetation change, and the official product QA for this pair shows unresolved failures, which TANGO displays instead of hiding.

### How It Works

Users pick a place on a 3D globe (CesiumJS). Each place opens an investigation that compares two NISAR dates. Every investigation asks four questions:

1. What did the satellite observe?
2. What changed between observations?
3. What could explain the difference?
4. How reliable is the evidence?

### Processing NASA Data

A Python pipeline processes NISAR Level-2 Geocoded Polarimetric Covariance (GCOV) products from NASA Earthdata and the Alaska Satellite Facility. It handles HH and HV, aligns each pair on a common grid, and produces georeferenced previews, difference maps, histograms and statistics.

**10 featured locations, each with a processed pair of NISAR observations (20 acquisitions).** Differences are separately calculated regional medians in dB (second date minus first).

| Location | Dates | Gap | Track / pass | HH median diff | HV median diff |
|---|---|---|---|---|---|
| Mount Etna, Sicily | Jul 23 – Aug 16, 2026 | 24 d | 51, descending | +0.67 dB | −0.44 dB |
| Rodanthe, North Carolina | Sep 17 – Sep 29, 2026 | 12 d | 162, ascending | +0.88 dB | +0.16 dB |
| Hubbard Glacier, Alaska | Nov 26 – Dec 8, 2025 | 12 d | 63, ascending | +0.28 dB | +0.39 dB |
| Louisiana Delta | Sep 29 – Oct 11, 2026 | 12 d | not recorded | −0.23 dB | +0.09 dB |
| Padma River, Bangladesh | Oct 4 – Oct 16, 2026 | 12 d | 69, ascending | −0.17 dB | −0.30 dB |
| Kīlauea, Hawaiʻi | Sep 4 – Sep 16, 2026 | 12 d | 151, ascending | −0.14 dB | −0.09 dB |
| Sossusvlei, Namibia | Oct 4 – Oct 16, 2026 | 12 d | 57, ascending | −0.10 dB | −0.08 dB |
| Big Sur / Plaskett Fire, California | Aug 22 – Sep 15, 2026 | 24 d | not recorded | −0.04 dB | −0.30 dB |
| Amazon River (Mamirauá), Brazil | Jul 7 – Jul 19, 2026 | 12 d | 161, ascending | +0.02 dB | +0.05 dB |
| Florida Everglades | Sep 30 – Oct 12, 2026 | 12 d | not recorded | +0.02 dB | −0.18 dB |

*Track and pass come from the NISAR granule names. Three pairs were fetched by ASF catalog ID, so their track and pass are not recorded in our evidence files.*

**What we checked, and what we haven't.** Every study area shows the same four checks, with failures left visible:

- **HH/HV validity: passed.** Both dates contain finite values (official QA also passed this for the Everglades, Louisiana and California pairs).
- **Grid alignment: passed.** Each pair sits on a common analysis grid (for example, 10 m on EPSG:32617 for the Everglades).
- **Official product QA: not cleared.** The Everglades, Louisiana and California pairs fail the official identification-group QA with the failing item unspecified. For the other seven, official QA records are not yet cleared.
- **Radiometric artifacts and noise: unverified.** RFI, banding and noise-floor effects need expert review.

Because of this, **every study area is marked "not cleared for quantitative analysis"**. The numbers are exploratory measurements, not confirmed environmental findings.

For some sites we also show independently sourced imagery, such as NASA Landsat for the Padma River. It is always labeled as distinct from NISAR.

### What Sets It Apart

Tools like ASF Vertex and NASA Worldview are excellent for finding and viewing Earth observation data. TANGO is aimed at a different problem: helping non-specialists reason about the evidence behind a radar difference, with failed checks shown rather than hidden.

- 3D globe exploration across 10 environments
- Swipe, side-by-side and difference views
- Real HH/HV statistics and histograms for each study area
- Regional analysis of selected areas
- Location-specific notes on possible environmental processes
- Visible quality checks, limitations and sources
- A downloadable evidence report and an educational FAQ

### Challenges We Faced

NISAR HDF5 files are large, and a comparison is only meaningful if the two dates share a grid and valid pixels. We aligned each pair on a common grid, screened invalid pixels, and converted screened linear power to dB with 10·log10, never subtracting display colors. We also had to avoid presenting a difference of two separate medians as if it were a pixel-by-pixel change.

The harder problem was explanation. Backscatter changes for many reasons, so each investigation separates what was measured from what it might mean.

### Intended Impact

TANGO is for students, newcomers to remote sensing, and anyone curious about what NISAR can show. It features environments where flooding, erosion, vegetation change and volcanic activity are studied, and it teaches why a radar difference alone doesn't establish any of them.

### What's Next

Most investigations are prepared by our team. We built a Coordinate Explorer for user-selected coordinates, but a full investigation still needs compatible acquisitions, processing and validation, and that pipeline isn't reliable end to end yet. Our comparisons use two dates, so they can't explain why a change occurred. Next we plan to expand the Coordinate Explorer, add longer time series, and bring in independent measurements such as water levels and rainfall.

### Tools

Python (processing); Next.js, React, TypeScript (website); CesiumJS (globe); MapLibre (comparisons); GitHub; Vercel. Claude Code and Codex assisted with coding, testing and debugging.
