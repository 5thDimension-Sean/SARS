# TANGO: Dancing with SARs

### Overview

TANGO is a website for exploring data from the NASA–ISRO Synthetic Aperture Radar (NISAR) mission. Radar can observe Earth's surface through clouds and at night, but reading it usually takes specialized software and training. TANGO lets students, researchers, and curious people explore real NISAR measurements on an interactive globe, and learn what a radar difference does and does not prove.

**A visible difference.** On Mount Etna, Sicily (Jul 23 and Aug 16, 2026), the median HH backscatter across our study area is about 0.7 dB higher on the second date, while HV is about 0.4 dB lower. HH and HV respond to different surface-scattering mechanisms, so their opposing changes are worth investigating. But neither measurement alone establishes volcanic activity: the numbers are separately calculated medians (not paired-pixel changes), and noise, artifacts and surface conditions can also move backscatter. Additional observations would be needed to determine the cause.

**A near-null result.** In the Florida Everglades (Sep 30 and Oct 12, 2026), the median HH backscatter is about −11.9 dB on both dates. The aggregate difference is only about 0.02 dB. That small number does not rule out localized increases and decreases that cancel out, and it is not a statistical or radiometric equivalence test. The official product QA for this pair also shows unresolved failures, which TANGO displays instead of hiding.

### How It Works

Users pick a place on a 3D globe (CesiumJS). Each place opens an investigation that compares two NISAR dates. Every investigation asks four questions:

1. What did the satellite observe?
2. What changed between observations?
3. What could explain the difference?
4. How reliable is the evidence?

### Processing NASA Data

A Python pipeline processes NISAR Level-2 Geocoded Polarimetric Covariance (GCOV) products from NASA Earthdata and the Alaska Satellite Facility. It handles HH and HV, aligns each pair on a common grid, and produces georeferenced previews, difference maps, histograms and statistics.

**10 featured locations, each with a processed pair of NISAR observations (20 acquisitions).** **Read this before the table:** all ten study areas are labeled "not cleared for quantitative analysis." These figures are descriptive outputs from real, screened NISAR data, intended for exploratory education. They are not calibrated, independently validated environmental measurements. Each is the difference of two separately calculated regional medians in dB (second date minus first), not a per-pixel change.

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

*Track and pass come from the NISAR granule names. For three pairs we stored only the ASF catalog ID, so track and pass are missing from our evidence exports; they are recoverable from the ASF records and are not unknown.*

**What we checked, and what we haven't.** Every study area shows the same four checks, with failures left visible:

- **HH/HV validity: passed.** Both dates contain finite values (official QA also passed this for the Everglades, Louisiana and California pairs).
- **Grid alignment: passed.** Each pair sits on a common analysis grid (for example, 10 m on EPSG:32617 for the Everglades).
- **Official product QA: not cleared.** The Everglades, Louisiana and California pairs fail the official identification-group QA with the failing item unspecified. For the other seven, official QA records are not yet cleared.
- **Radiometric artifacts and noise: unverified.** RFI, banding and noise-floor effects need expert review.

Passing validity and grid alignment does not establish radiometric comparability: incidence angle, noise floor, speckle and processing artifacts can all influence a difference. So these statistics are descriptive results from real NISAR observations, useful for exploratory comparison and education, but unresolved product QA and radiometric uncertainty prevent us from treating them as independently validated environmental changes.

**Sampling.** Each statistic covers one selected study area, not a whole coastline, volcano or wetland, and should not be generalized beyond it. In six pairs both dates have identical valid-pixel counts. In the other four the counts differ by 16 pixels or fewer (Etna 4, Hawaiʻi 1, Hubbard 16, Sossusvlei 1), so the masks are not strictly identical. For each investigation we selected a geographic area of interest and cropped the satellite observations to a common analysis footprint. Our pipeline restricts comparisons to the same track, frame and pass, and checks geographic alignment and valid measurements before comparing. We did not test whether the chosen areas are representative of their surroundings.

For some sites we also show independently sourced imagery, such as NASA Landsat for the Padma River. It is always labeled as distinct from NISAR.

### What Sets It Apart

Tools such as ASF Vertex and NASA Worldview are valuable for discovering and viewing Earth observation data. TANGO focuses on helping non-specialists interpret what those observations mean. Each investigation combines actual radar measurements with a guided explanation, visible quality checks (including failures), and a downloadable evidence report. Rather than simply showing where radar signals changed, TANGO helps users understand which conclusions are supported and which require additional evidence.

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

Most investigations are prepared by our team. The Coordinate Explorer currently supports custom coordinate entry and validation, and includes a workflow for requesting NASA catalog searches and satellite processing from a backend. Reliable end-to-end generation of new investigations has not yet been verified on the live website, so completing and validating that workflow is one of our next priorities. We have not yet tested TANGO with users or compared any site with independent observations such as water levels; both are our next steps. Our comparisons use two dates, so they can't explain why a change occurred. Next we plan to expand the Coordinate Explorer, add longer time series, and bring in independent measurements such as water levels and rainfall.

### Tools

Python (processing); Next.js, React, TypeScript (website); CesiumJS (globe); MapLibre (comparisons); GitHub; Vercel. Claude Code and Codex assisted with coding, testing and debugging.
