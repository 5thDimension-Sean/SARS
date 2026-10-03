# Backend and dashboard integration verification

Verified on Windows x64, 2026-10-03.

- Pinned dependencies installed exclusively from wheels in independent CPython 3.14.7 and 3.13.16 virtual environments. `pip check` is clean in both.
- All **64 Python tests pass** on both interpreters, with no warnings. The suite contains 47 scientific/layout processing checks and 17 fetch/inspection checks.
- PyPI release metadata confirms wheel availability for the pinned dependencies on Python 3.13/3.14 for Windows x64, macOS arm64, and Linux x64. macOS/Linux execution was not performed on this Windows host; installation uses `--only-binary=:all:` so unsupported platform/OS combinations fail instead of compiling.
- A bounded anonymous ASF dry run returned L-band GCOV results. See [catalog verification](fetch-verification.md). Authentication and large real-product payload downloads are covered by offline mocks, not by a live Earthdata account.
- Three explicitly synthetic HDF5 files were inspected and processed through the actual CLI. The resulting PNGs, COGs, and manifest totalled 0.73 MiB. Their QA source/labels were explicitly changed to **SYNTHETIC TEST FILES — NOT NASA OBSERVATIONS** before loading them in the local preview.
- The exported static dashboard loaded that processor output and showed a separate Processed GCOV category with DERIVED labels. Initial comparison selects the latest two dates and displays the matching precomputed change layer.
- Running-preview checks passed for HH/HV raster and chart selection, before/after swipe, fixed display scales, layer switches, acquisition/source/version/maturity fields, track/frame search, timeline Home/End/arrow stepping, date slider, and playback stopping at the final acquisition.
- All PNG assets loaded; a COG served by the static preview matched the generated file's SHA-256 exactly.
- Mobile layout at 390×844 had no horizontal overflow; analysis/layer overlays worked and returned focus to their triggers when closed. Desktop checks used 1440×900. Existing reduced-motion rules remain in place; browser media emulation is not available on this connected browser, so this remains a CSS inspection check rather than an emulated motion-preference run.
- A malformed derived manifest displayed an explicit warning while retaining functional sample data. The shipped empty sample manifest avoids an expected missing-resource console error.
- All **11 frontend tests pass**, and the final production build exits successfully. No runtime errors/warnings were logged during the integration checks.

Synthetic QA rasters were removed from the exported preview after testing and preserved under the ignored QA environment directory. The source `public/data/manifest.json` contains only an empty sample sentinel; no synthetic data is presented as a real NASA acquisition. The running preview was returned to sample mode and temporary viewport dimensions were reset.

Visual evidence: [desktop synthetic integration](../../frontend/docs/backend-integration-synthetic.jpg) and [mobile synthetic integration](../../frontend/docs/backend-mobile-synthetic.jpg). These screenshots are test evidence, not mission observations.

The remaining external validation is an authenticated download and end-to-end processing of selected real GCOV files. Product calibration quality, the source mask/optional quality layers, and any scientific interpretation still require review against the corresponding release specification.
