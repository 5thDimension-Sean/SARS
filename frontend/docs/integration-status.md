# Local implementation integration — November 7, 2026

This document supersedes the repository-state and deferred-backend statements in older frontend READMEs and checkpoints. Historical science reports remain unchanged: their evidence applies only to their recorded runs.

## Acceptance criteria

Keep the local redesign-v2 interface and both NISAR commits. Do not import the Claude redesign. Preserve the scientific pipeline, evidence reports, sample labeling, browse prototype, public route names and GitHub Pages base path. Implement the applicable engineering requirements in the tracked project Markdown. Treat absent data, same-day selections, missing polarization, invalid assets and unresolved QA as explicit unavailable states.

## Requirement disposition

| Source / requirement | Current implementation |
| --- | --- |
| AGENTS.md: six Discovery Lab tools with no real data | All six tools open from Explore tools. Sample Investigate, Optical and numerical evidence explain unavailable inputs. Tour and acquisition playback work with the local sample console. |
| AGENTS.md: report safety and provenance | HTML report escapes every source string and includes dates, polarization, provenance, evidence gaps and scientific caveats. Download control supplied; automated browser download-event capture could not confirm the file. |
| Pipeline README: processed manifest loading | Console checks the manifest and links to /processed. The processed viewer validates schema, paths, CRS, bounds, dimensions, dates, polarization, histograms and statistics before rendering local assets. Invalid/missing manifests retain truthful empty states. |
| Pipeline README: processed rasters and statistics | /processed supports frame/date/polarization selection, fixed-scale raster swipe, acquisition playback, histogram tables, frame-wide means, metadata and COG downloads. Statistics are reduced-grid descriptions, not affected-area measurements or pixel time series. |
| AGENTS.md: numerical ROI / optical data | No fabricated grids or optical images. Quantitative local ROI, temporal difference layers and optical comparison remain withheld until validated common-support QA and aligned optical assets exist. This is an explicit data/science dependency, not a claim of a completed quantitative feature. |
| AGENTS.md: visible scientific uncertainty | Official QA/artifact interpretation and independent verification always remain UNVERIFIED. Processing agreement cannot clear a product or determine environmental cause. Current Everglades data remain NOT CLEARED. |
| Frontend README: existing interactions | Sample selection/search, timeline, swipe, zoom, fullscreen and mobile sheets retained. Added right-button pan, pointer-anchored wheel zoom and bounded keyboard-accessible panel size controls. Grid defaults off; cosmetic scan shading reduced without altering measured rasters. |
| AGENTS.md: public URLs and GitHub Pages | / and /nisar-prototype retained; /explore and /map use the local console. Previous learning/mission/discovery/hypothesis/disaster/playground URLs and five study URLs have truthful educational pages. These are compatibility pages, not the removed upstream redesign. NEXT_PUBLIC_BASE_PATH and trailing-slash static export supported. |
| Data-access checkpoint docs | Bounded authenticated transport, exact-host redirects, credential isolation, tests and immutable reports preserved. No new authenticated reads or scientific clearance claimed. |
| AGENTS.md: automated checks | Frontend data/report/zoom tests, ESLint, TypeScript/static build and Python tests. GitHub workflows check frontend and pipeline before Pages deployment. |

## Validation and boundaries

- Baseline and updated Python suite: 134 tests pass with the test temp directories explicitly placed in a writable project folder. There are 60 existing Affine deprecation warnings. The first runs failed because Windows sandbox temporary directories could not be created/deleted, not because of scientific assertions.
- Frontend unit tests: 14 pass, including malicious source strings, missing/invalid data, wrong products, unsafe paths, duplicate dates, all-masked statistics and pointer zoom anchoring.
- The Windows static exporter encountered EPERM during parallel recursive directory creation. The build command now serializes Windows filesystem work and bounds export concurrency. Other platforms keep their normal filesystem settings. Compatibility routes are explicit static pages.
- A synthetic HDF5 fixture was processed using the actual Python processor and its emitted manifest was accepted by the frontend validator for HH and HV. Synthetic outputs remain in ignored verification folders and are not published as NASA observations.
- Browser: desktop console and all six tool launchers render; Investigate, Check Evidence and Make a Report content inspected. Sample/derived labels and missing processed data visible. Sidebar positioning/width constraints inspected in the live DOM. Full browser journey and real NASA connectivity remain subject to the limits below.
- No real processed assets were added. Browser WebGL/NASA imagery availability, narrow-viewport journeys, drag interactions, timeline completion and report file saving require final browser verification before deployment. A build is not proof of those interactions.
- GitHub DNS resolution fails in this execution environment. Remote branch state cannot be refreshed or pushed here. Any ahead/behind comparison uses the locally recorded origin/main, not a claim of live GitHub state.

## Local commands

Run from C:\Projects\SARS\SARS, not its parent folder:

```powershell
Set-Location C:\Projects\SARS\SARS\frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build
# A development server already uses localhost:5173; do not start another for this folder.
```

For a GitHub Pages path preview, set `$env:NEXT_PUBLIC_BASE_PATH='/SARS'` before building and serving. The static preview uses the same base path. Without that variable, the app builds and serves at `/`.

Pipeline tests in a restricted Windows session (choose a fresh temp path):

```powershell
Set-Location C:\Projects\SARS\SARS
$sarsTempRoot = (Resolve-Path frontend/outputs).Path
$env:TEMP = $sarsTempRoot
$env:TMP = $sarsTempRoot
$sarsTestRoot = Join-Path $sarsTempRoot ('pytest-' + [guid]::NewGuid().ToString('N'))
& pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q --basetemp $sarsTestRoot
```

Authenticated science commands in older checkpoint docs refer to the original machine and branch. Use the current repository directory and the same terminal in which Earthdata authentication is configured. Never put a token in Git or frontend configuration. Follow pipeline/docs/scientific-validation-checkpoint.md for evidence collection and manual QA; transport success alone does not authorize quantitative analysis.
