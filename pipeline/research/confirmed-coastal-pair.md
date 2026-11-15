# Confirmed coastal NISAR comparison — available now

The **Louisiana Mississippi River Delta** study already on the NISAR hackathon-ready branch is a genuine two-acquisition, same-track/frame NISAR L2 GCOV pair. It was processed using the Everglades-style scientific export; it is **not** a validated erosion measurement.

| Field | Earlier | Later |
| --- | --- | --- |
| ASF CMR granule | G4330259432-ASF | G4361359332-ASF |
| UTC acquisition date | 2026-09-29 | 2026-10-11 |
| Track | 156 | 156 |
| Frame | 74 | 74 |
| Polarizations | HH, HV | HH, HV |
| Grid | EPSG:32615; 10 m | EPSG:32615; 10 m |
| ROI | [-89.43, 29.19, -89.39, 29.23] | same |

Actual files already in the repository:

- `frontend/public/data/louisiana-preview/preview-manifest.json` (source IDs, dates, image checksums, fixed display ranges)
- `frontend/public/data/louisiana-preview/20260929_HH.png`, `20260929_HV.png`
- `frontend/public/data/louisiana-preview/20261011_HH.png`, `20261011_HV.png`
- `frontend/public/data/louisiana-regions/HH_difference_exploratory.png`, `HV_difference_exploratory.png`
- `frontend/public/data/louisiana-evidence/evidence.json` (per-date statistics and QA)

**QA:** 184,628 screened pixels per acquisition/polarization, aligned selected frequency-A ROI. The official NISAR identification-group QA **failed** on both acquisitions; RFI/noise/banding remain **unverified**. The colored exploratory difference imagery is not a measured shoreline retreat map.

The prospective Cameron Parish site in `cameron-coastal-erosion-plan.md` is a separate **new** coastal study and still needs a public catalog match and Earthdata-authenticated science HDF5 files before processing. Do not imply it already has an actual compatible pair. The public GIBS mosaic cannot replace the numeric GCOV grids.

Relevant NASA granules: https://cmr.earthdata.nasa.gov/search/concepts/G4330259432-ASF.umm_json and https://cmr.earthdata.nasa.gov/search/concepts/G4361359332-ASF.umm_json
