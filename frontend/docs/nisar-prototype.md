# NISAR Scientific Evidence viewer

`/nisar-prototype` is a guided investigation: **1 Look** (synchronized before/after radar, swipe / side-by-side / exploratory difference) → **2 Inspect a region** (A/B/C, highlighted on the map) → **3 Compare the whole scene** (histogram + statistics) → **4 Check the evidence** (QA checks, limitations, provenance). A location selector (Everglades, Louisiana Delta) and an HH/HV toggle apply everywhere. `EXPLORATORY_NOT_CLEARED` is visible at all times.

## Data contract

Per study the page reads, under `public/data/`: `<study>-evidence/evidence.json`, `<study>-regions/regions.json` + `regions.geojson` + `{HH,HV}_difference_exploratory.png`, and (Everglades only) `everglades-preview/preview-manifest.json` + four single-date PNGs. `lib/investigation.ts` validates every file before display (dates and granule IDs match the study, histogram bins reconcile with pixel counts, published differences match per-date statistics, regions carry no environmental conclusion and are labelled exploratory). A file that fails validation produces a visible error, never substitute data.

Adding a study = one entry in `STUDIES` plus its files. All three studies (Everglades, Louisiana Delta, Big Sur California) now have single-date previews, evidence and regions. A study without a validated preview manifest falls back to the difference map and says so. California also loads `california-context/context.json` (credited incident photographs; validated, labelled "not NISAR measurements", never geographically matched to radar).

## Visual system (current)

Strictly black / white / gray: canvas `#000`, text `#f5f5f7` / `#a1a1a6`, hairlines `#ffffff1f`, white fills for the selected state. Quality status is carried by the word and badge shape (FAIL = filled, UNVERIFIED = dashed, PASS = outline), never by colour. The only colour is the difference-map legend, which reproduces the colours encoded in the published PNGs. The fictional lab on `/` is rendered in grayscale. Navigation: a global Apple-style bar in the root layout (Home · Everglades · Louisiana · California, sliding active pill that persists across routes; HH/HV on the investigation page). Location is carried in the URL fragment (`/nisar-prototype#california`) and polarization in a tiny shared store (`lib/view-store.ts`). Fonts are system stacks: Apple SF Pro on Apple devices; Segoe UI elsewhere (SF cannot be redistributed). Map wheel-zoom works inside the box on desktop; touch keeps two-finger gestures so the page still scrolls. A Color / Black & white option applies to the difference map and photographs. Layout: nav → hero → radar primer → 01 Look (map + permanent region inspector) → 02 Compare → (03 Context, California only) → Verify.

## Scientific guardrails implemented

- Numbers come only from the JSON files; all explanatory sentences are templates over those numbers and never name a physical cause (tested).
- Whole-scene differences are labelled "difference of separate regional summaries"; region numbers are paired per-pixel statistics. The UI notes they are not interchangeable.
- Raster layers use nearest-neighbour sampling: no smoothing or sharpening. The difference PNGs are placed on their native UTM grid using four geographic corners (inverse UTM, verified in tests against the published region polygons).
- NASA GIBS is coarse context only and is added only after the existing two-date tile probe passes; failure never blocks the measured previews.
- Quality statuses (PASS / FAIL / UNVERIFIED) come from `evidence.json` and are shown as text, not a score. The `warning` strings in `regions.json` are intentionally not rendered (see data notes below).

## Data notes for the analysis owner

- `louisiana-regions/regions.json` `warning` says both official identification-group checks failed and contains mojibake (`â€”`), while `louisiana-evidence/evidence.json` says Louisiana QA is UNVERIFIED. The UI follows `evidence.json`.
- Everglades whole-scene HH median shift in `evidence.json` is +0.0223 dB (displays as +0.02 dB), not +0.03.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs tests, lint and build on every PR and, on pushes to `main` (or manual dispatch), publishes `frontend/out`. In the repository, set **Settings → Pages → Source = GitHub Actions** once. The workflow sets `NEXT_PUBLIC_BASE_PATH=/<repo>` so the site is served at `https://<owner>.github.io/<repo>/nisar-prototype`. `next.config.ts` and `dataUrl()` both read that variable; local development uses no prefix.

---

# Earlier prototype notes (historical)

# Limited NISAR map prototype

## Repository reconciliation

On November 6, 2026, local `redesign-v2` pointed at `b4370f792847e5d9afbf13ed816fff34fedb8d22` with no tracked changes. GitHub `main` was 18 commits ahead. Its comparison explicitly lists `AGENTS.md` as added; no local history contains that path. The local `origin/main` reference is stale. `redesign-v2` was not listed among remote branches.

Read the upstream [engineering playbook](https://github.com/5thDimension-Sean/SARS/blob/main/AGENTS.md) and [pipeline contract](https://github.com/5thDimension-Sean/SARS/blob/main/pipeline/README.md) before implementation. No checkout, reset, merge, pull, push, or deployment was performed. The upstream pipeline and additional pages have not been imported or modified. This additive prototype will need integration review against those newer changes before any future merge.

## Scope and acceptance criteria

- `/` retains the fictional educational demo. `/nisar-prototype` is independent and imports no sample acquisitions or measurements.
- A client-loaded, pinned MapLibre map provides real geographic navigation, scale, and coordinates within the validated South Florida tile.
- Dates are September 30 and October 12, 2026. Both layers use identical EPSG:3857 tile addressing. One camera and instant date switching avoid synchronization drift and interpolated images.
- Comparison is gated by live PNG decoding, dimensions, at least 95% overlapping nontransparent pixels in the verified zoom-9 tile, nonblank imagery, map readiness, and no renderer/tile error. These checks establish display availability, not scientific quality. The raster source is capped at zoom 9 so navigation enlarges the verified pixels instead of introducing unverified higher-resolution coverage. A failure disables comparison and never substitutes synthetic imagery or the other date.
- Attribution, provisional maturity, source identifiers, acquisition times, and RGB limitations are visible. There are no ROI numbers, displacement, dB differences, change alerts, or polarization controls.

## Sources

- [GIBS capabilities](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml): `NISAR_L2_Geocoded_Polarimetric_Covariance`, `GoogleMapsCompatible_Level13`, 256-pixel PNG tiles.
- Verified tile: zoom 9, column 141, row 218. Source URLs use WMTS row before column.
- [September 30 granule](https://cmr.earthdata.nasa.gov/search/concepts/G4342506513-ASF.html): 00:05:12–00:05:47.999 UTC.
- [October 12 granule](https://cmr.earthdata.nasa.gov/search/concepts/G4373929961-ASF.html): 00:05:13–00:05:47.999 UTC.
- Both source footprints intersect 25.5 N, 80.8 W, descending track 170/frame 076. Mosaics may combine products; these records do not establish exact pixel lineage.
- [ASF Worldview guidance](https://hyp3-docs.asf.alaska.edu/nisar-docs/worldview/), [known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/), [collection DOI](https://doi.org/10.5067/NIL2GCOV-P1).

Tiles are fetched directly from NASA; the user's browser makes public imagery requests. No credentials, location permissions, uploads, or numerical science products are involved. GIBS availability can change. Calibration, acquisition mode, and mosaic selection can affect apparent color changes.

## Run and verify

From `frontend/` in PowerShell (use `npm.cmd` if execution policy blocks `npm.ps1`):

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open http://localhost:5173/nisar-prototype for the real-data prototype, or http://localhost:5173/ for the educational demo. For the production export, stop the dev server and run `npm.cmd start`; use http://127.0.0.1:5173/nisar-prototype. Network access to NASA and WebGL support are required.

Browser acceptance remains outstanding: the computer-use safety layer stopped this session because it could not reliably determine Chrome's URL. A successful build is not evidence of visual interaction correctness.

Automated validation on November 6, 2026: all 7 tests passed; full ESLint passed; production build and TypeScript validation passed with `/` and `/nisar-prototype` exported. HTTP smoke checks returned 200 for `/`, `/nisar-prototype`, and `/nisar-prototype.html`. `git diff --check` passed. Next.js reported an existing lockfile outside the repository; the build completed successfully without changing that external file.

The full lint run exposed existing ref-access and internal-navigation violations. Small fixes retain the mobile panel's last displayed content in state, update the tool-state ref after commit, and use Next Link for the home link. No sample data or analysis formulas changed. The local static server now resolves extensionless exported routes.

Manual checklist: inspect both date images; pan and zoom without changing the comparison viewpoint; verify attribution and provenance; try narrow/mobile width and keyboard navigation; block NASA requests and confirm comparison disables; retry after reconnecting; confirm the demo still works. Do not deploy until these checks pass.


## Additions (settings, story map, changed pixels, FAQ)

- **Display settings** (`components/settings-menu.tsx`, `lib/prefs.ts`): Auto/Light/Dark, Color/Black & white, Full/Reduced motion. Stored in localStorage only; a first-party boot script in `<head>` applies them before paint. Black & white is a root filter, so it covers charts, maps, photographs and the lab. The lab stays dark in every theme.
- **Type**: Geist and Geist Mono (SIL OFL), self-hosted from the copies inside the Next package (`app/fonts/`); no third-party font requests.
- **Map limits** (`lib/map-limits.ts`): zoom-out and panning stop at the published scene. "Wider NASA GIBS context" is opt-in and relaxes the limit to the GIBS tile.
- **Changed pixels** (`lib/change-filter.ts`): hides faint colors of the published difference image. It works on color strength, not dB, and never produces a number (the project rules forbid deriving dB from a displayed PNG).
- **Story map** (`components/story-map.tsx`): placeholder scrollytelling on `/`. Locations and dates come from the study registry; the story text is a draft slot.
- **Questions** (`lib/faq.ts`): curated, searchable answers. Nothing is generated. A free-form AI assistant is deliberately not included: it would need a server and API key (not possible on static Pages), could state unsupported scientific conclusions, and the project forbids AI-generated conclusions.
