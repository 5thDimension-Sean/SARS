# Limited NISAR map prototype

The repository-reconciliation statements below are historical. See [current integration status](integration-status.md). The prototype remains a separate browse-only route; it does not clear scientific analysis.

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
