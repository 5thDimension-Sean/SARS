# Everglades GCOV compatibility checkpoint

Status: **NOT CLEARED FOR QUANTITATIVE ANALYSIS**. The software is implemented and tested offline; authenticated product inspection is pending local Earthdata credentials. No environmental change has been calculated or interpreted. The latest machine-readable evidence is [everglades-checkpoint-20261106-final.json](../reports/everglades-checkpoint-20261106-final.json).

## Repository recovery

Local `redesign-v2`, local `main`, and the stale `origin/main` tracking reference pointed to `b4370f792847e5d9afbf13ed816fff34fedb8d22`. GitHub main was 18 commits ahead at `ae93dfb2be0f71f9b7197b323c8918d0d281579b`; no remote redesign-v2 branch was found. The missing AGENTS.md and pipeline were later upstream additions, not tracked local deletions. Only the 12 absent files listed with Git blob hashes in [upstream-restoration.json](upstream-restoration.json) were restored. No branch pointers moved. Existing frontend modifications and untracked files were preserved. Main, frontend-clean/ and frontend.zip were not changed.

## Catalog evidence

Source: NASA-ISRO NISAR, distributed by NASA ASF DAAC. CMR records were retrieved on November 6, 2026. Machine-readable reports retain exact primary URLs, filenames, catalog hashes, catalog checksums, acquisition timestamps and processing identifiers.

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Primary GCOV product identification | PASS | [G4342506513-ASF](https://cmr.earthdata.nasa.gov/search/concepts/G4342506513-ASF.umm_json), 4,643,094,528 bytes; [G4373929961-ASF](https://cmr.earthdata.nasa.gov/search/concepts/G4373929961-ASF.umm_json), 4,504,682,496 bytes |
| Acquisition start UTC | PASS | 2026-09-30 00:05:12; 2026-10-12 00:05:13 |
| Catalog geometry / acquisition mode | PASS | Track 170, frame 76, descending; full frame; joint observation; frequency A 40 MHz, B 5 MHz; HH/HV in both bands |
| Catalog processing agreement | PASS | PROVISIONAL collection; product 1.0.11; CRID P05023; PGE R05.02.3; ISCE3 0.25.16; production PR |
| Proposed ROI in both catalog polygons | PASS | WGS84 west/south/east/north = -80.82, 25.48, -80.78, 25.52; this is not raster-valid coverage |
| Authenticated HDF5 access | UNVERIFIED | Credentials were not configured when attempted; both anonymous range requests returned HTTP 302. Redirect bodies were not consumed |
| Actual polarization datasets and units | UNVERIFIED | Catalog channels and product specification do not prove actual HDF5 contents |
| Actual grids, pixel alignment, overlap and valid counts | UNVERIFIED | No HDF5 pixels read |
| Actual HDF5 processing metadata | UNVERIFIED | Must reconcile HDF5 identity with catalog, including release/version |
| Quality layers, official QA and radiometric artifacts | UNVERIFIED | Requires authenticated product inspection and scene-specific review |
| Full-file checksum | UNVERIFIED | Partial range reads cannot establish a full-file checksum |
| Suitability for defensible paired analysis | UNVERIFIED | Catalog compatibility is necessary but insufficient |

No scientific incompatibility has been demonstrated, so a FAIL is not assigned merely because access is unavailable. The CLI can emit FAIL for confirmed grid/identity/coverage mismatches. The verdict remains not cleared even if automated structural checks pass: scientific quality review is required.

## Access and transfer limits

Run from the repository root, using a new report filename for every run:

```powershell
pipeline/.venv/Scripts/python.exe -m pipeline.check_compatibility --output pipeline/reports/everglades-authenticated.json
pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q
```

The restored fetch module supplies `ASFSession` authentication. Configure an Earthdata Login entry for `urs.earthdata.nasa.gov` in `.netrc` or `_netrc` in your user home, outside this repository; `NETRC` can select another private path. Alternatively set `EARTHDATA_TOKEN` in the local process environment. Do not paste credentials into chat, shell command arguments, reports, Git or frontend configuration. Authentication exchanges can create/use an EDL token; product operations are read-only. Session state is not saved by this checkpoint.

The reader permits only canonical HTTPS URLs on the NASA NISAR data host, rejects credential-bearing URLs, refuses redirects, requires exact HTTP 206 Content-Range responses, and validates a stable ETag when supplied. Some authenticated endpoints may require an additional redirect/token exchange; such a response stops safely and remains UNVERIFIED. No download fallback is implemented.

Each product has a 64 MiB response-body budget, 1 MiB blocks and an 8 MiB in-memory LRU cache. No persistent science cache exists. A single read is limited to 8 MiB; ROI windows are capped at 250,000 pixels per frequency. HDF5 metadata is read first, then explicit small raster windows. HDF5 chunk layout may require more transferred bytes than ROI size implies; budget exhaustion is reported rather than silently downloading the file. External/soft links and virtual/external dataset storage are rejected before reading values.

The initial network report consumed **59,406 catalog body bytes and 0 HDF5 body bytes**, with one rejected range request per product. Transfer numbers measure bytes consumed by the application, not HTTP/TLS overhead, OS buffering, authentication exchanges, package installation or preceding exploratory metadata requests. The earlier report without `-network` records a sandbox-blocked attempt; it contains no product evidence. Every subsequent run records its own totals rather than overwriting earlier evidence.

## Scientific safeguards and limitations

The [GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/) describes calibrated gamma0 power and the available covariance and supporting layers. Actual file units and processing metadata must still be inspected. This checkpoint records datasets, attributes, coordinates, native ROI windows and mask-code counts. Finite positive samples exclude declared fill and mask 0/255, consistent with the restored pipeline's initial screen. These counts are labeled screened pixels, not scientifically certified valid pixels. No independent per-date multilooking or temporal subtraction is performed.

ASF's [provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/) identifies residual radiometric bands in joint-mode 40 MHz data. Both catalog records match this mode, so banding is an applicable risk, not a scene-specific finding. Before clearance, inspect per-date native power and QA for bands, seams, RFI, missing ensembles, noise-floor effects and RTC/number-of-looks behavior. Determine whether features follow acquisition geometry, persist across stable reference areas, or are associated with mask/quality boundaries. A small ROI alone cannot rule out swath-scale artifacts. Same-version processing does not guarantee that biases cancel.

The restored pipeline offers useful coordinate validation, authentication, georeferencing, masking and output writers. This checkpoint reuses its authentication and coordinate checker without modifying the upstream processor. Its current per-date multilooking can average different valid source supports on different dates; that must be addressed by common-support masking before any later paired quantitative analysis. Existing synthetic tests verify software behavior, not NASA scene validity.

No GIBS RGB tiles, fictional measurements, environmental classifications, displacement estimates or frontend assets are generated. A finalized ROI and full quality assessment remain prerequisites for quantitative analysis. This checkpoint deliberately leaves the application and educational demo unchanged.

## Validation

Python: 84 tests passed, including 19 new bounded-access/inspection tests and 65 restored tests. The restored processor emits 60 existing Affine multiplication deprecation warnings. Runtime Python 3.14.8 differs by a patch release from restored `.python-version` (3.14.7); package versions are pinned in requirements and recorded in new reports. Frontend: 7 tests passed; lint and production build passed via npm.cmd. No UI interaction validation is claimed because no UI code changed. All 12 restored files match their upstream Git blob hashes. The frontend source digest matches its pre-checkpoint digest exactly.
