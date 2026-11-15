# Etna, Sumatra and Queensland pair search

Checked November 14, 2026 (America/New_York). Machine timestamps in source-index.json are UTC.

| Target | Result | What can be used |
| --- | --- | --- |
| Etna | Matching GCOV catalog pair for July 23 / August 16, 2026 | Four unmodified frequency-A HH/HV browse PNGs, catalog byte size and MD5 verified. The pair spans the August 6 episode, not the original winter eruption. |
| Northern Sumatra | No event-period NISAR product returned | All science collections were searched over 95–100.5°E, 0–6°N for November 1–December 31, 2025. Later 2026 products cannot document Senyar. |
| Central/eastern Queensland | No processed pair spanning January 11 Koji landfall found | Track 23's December 29 / January 10 pair is rejected because both dates precede landfall. Statewide post-event raw-data leads are outside the target and are not GCOV imagery. |

## Etna acquisition selection

- July 23: [G4260544499-ASF](https://cmr.earthdata.nasa.gov/search/concepts/G4260544499-ASF.umm_json).
- August 16: [G4284906695-ASF](https://cmr.earthdata.nasa.gov/search/concepts/G4284906695-ASF.umm_json).
- Both: NISAR_L2_GCOV_PROVISIONAL_V1, product 1.0.11, CRID P05023, descending track 51 / frame 69, frequency A HH/HV, 20 MHz, full frames, matching PGE. Both catalog footprints contain 15°E, 37.75°N.
- The 24-day interval straddles the [permanent July 27–August 10 instrument gap](https://nisar-docs.asf.alaska.edu/availability-overview/). It does not sample the eruption's day-by-day evolution.
- [DLR documents the August 6 episode](https://www.dlr.de/en/eoc/latest/news/2026/etna-volcano-eruption-leaves-thousands-of-tourists-stranded) with Sentinel-5P context. This confirms event timing; it is not an independent NISAR lava-change classification.
- All four PNGs decode to 1968 × 1940 pixels. Matching dimensions and hashes establish file integrity, not numerical grid compatibility or a common display scale.
- Both QA CSV requests returned HTTP 401. No Earthdata token or netrc is configured. Underlying HDF5 arrays, calibration, masks, co-registration and common valid pixels remain unverified.

## Search coverage and limits

The source index records all twelve complete NASA CMR requests, their bounding boxes or point, date windows, collection identifiers and exact hit counts. Event-window searches include all catalogued NISAR L0–L3 science collections, including BETA, PROVISIONAL and VALIDATED releases; GCOV-only searches also cover October 2025 through November 14, 2026. The initial Etna winter and Lhoksukon event searches returned zero hits; widening northern Sumatra also returned zero. The initial central/eastern Queensland post-event search returned no processed product. A statewide January 11–February 28 search returned five L0B RRSD products; their footprints do not intersect the central/eastern target box [146, -25, 151, -18.5].

These are current public-catalog availability results. A zero-hit search does not prove no raw acquisition exists or that future reprocessing will never release it. No unpublished data or multi-gigabyte science files were downloaded. ISRO's public gallery did not supply a verified event-spanning pair for these three targets.

[Senyar context](https://science.nasa.gov/earth/earth-observatory/senyar-swamps-sumatra/) uses Landsat 9. [Koji context](https://www.bom.gov.au/cyclone/history/Koji_2026.shtml) establishes January 11 landfall. Neither source supplies a NISAR before/after pair.

All preview entries remain BLOCKED / EXPLORATORY_NOT_CLEARED with null measurements. Do not describe Etna's catalog match as measured lava change or imply the two flood pairs were verified.

## Validation

All 58 frontend tests, lint and the production build pass. All sixteen local media files match their hashes in the static export. Browser checks confirmed all four Etna images load, HH/HV selection works, and date toggling selects August 16. The image/control layout was inspected at a 390 × 844 viewport. No numerical pipeline code was modified or scientific clearance granted.
