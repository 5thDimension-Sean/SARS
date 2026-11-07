# SAR-Waltz — Earth Observation Console

Frontend checkpoint for the 2026 NASA Space Apps Challenge. React 19, Next.js static export, Tailwind CSS v4 semantic tokens, existing shadcn/Radix controls, Lucide, and Recharts.

## Run

Current status and requirement disposition: [local integration](docs/integration-status.md). Earlier approval-checkpoint statements below describe historical work and are superseded by that document. The offline Python pipeline now exists; scientific QA remains unresolved.

Requires Node.js 22.13 or newer. From this directory:

```sh
npm ci
npm run dev
```

Open http://localhost:5173/. To verify and serve the generated static app:

```sh
npm test
npm run build
npm start
```

The build writes `out/`. `npm start` serves that directory at http://127.0.0.1:5173/. Stop any existing preview before starting another on the same port. No authentication, database, Earthdata credentials, or runtime Python is needed.

## Explore

The console includes a collapsed **Explore tools** launcher for six Discovery Lab tools. `/processed` loads locally prepared GCOV manifests and assets with runtime validation and explicit unavailable states. No real processed assets or quantitative change detections are supplied in this checkout. `/explore` and `/map` retain access to the local console; the existing public education and study URLs remain available.

The limited real-data prototype is at `/nisar-prototype`; `/` remains the educational demo. It uses MapLibre and NASA GIBS for the verified Everglades dates September 30 and October 12, 2026. See [prototype scope, safeguards, and preview instructions](docs/nisar-prototype.md). No scientific measurements are computed from browse imagery.

- Select Wetland loss, Earthquakes, or Deforestation, then either hotspot.
- Search aliases such as Everglades, Sundarbans, Parkfield, Hayward, Amazon, or Tapajós. Ctrl/Cmd K opens search; arrows and Enter select a result.
- Drag the viewport comparison handle, or focus it and use arrow keys.
- Toggle change highlights, area boundaries, and the coordinate grid. Zoom, recenter, or expand the viewport; Escape closes the expanded view.
- Choose HH/HV for backscatter or displacement/wrapped phase for earthquakes. Signal and Acquisition tabs share the selected state.
- Select a baseline and acquisition, play the sequence at 0.5×/1×/2×, or use Left/Right and Home/End outside text inputs, sliders, tabs, and menus. Playback pauses at the final acquisition. The 24-day gap contains no invented intermediate pass.
- At compact widths, open the Layers and Analysis overlays. They trap focus and return focus when closed. Motion follows `prefers-reduced-motion`; chart animations are disabled.

## Data and viewport contract

`data/sample-data.json` is pure JSON with no functions or JSX. `lib/sample-schema.ts` defines the reusable contract: phenomena, locations, real coordinates and their sources, ISO acquisition dates, product type, polarization, orbit/frame, dB histogram bins, displacement profiles, sample metrics with units/area/provenance, events, and nullable layer/tile URLs. Every metric uses `provenance: "sample"`. `scripts/generate-samples.mjs` reproducibly generates the sample asset; it is not a NASA data pipeline.

All dates, acquisition identifiers, areas, events, values, and rendered textures are fictional illustrations. Geographic coordinates are real, but the samples make no claim about changes at those locations and depict no named real earthquake. Backscatter histograms normalize to pixel frequency (%) using gamma-0 dB bins; displacement profiles share the first acquisition as their reference and use positive motion toward the sensor. Canopy and wetland loss require independent validation.

`components/dashboard/observation-viewport.tsx` exposes `ObservationViewportProps` for the educational demo. Its procedural renderer is preserved. The independent `/nisar-prototype` route uses MapLibre; CesiumJS and deck.gl are not installed. The procedural raster cache is bounded to 24 entries; sample surfaces update by acquisition and geographic seed.

The offline pipeline emits a separate processed manifest. `/processed` validates and renders those assets without coercing measured data into the fictional `SampleDataset`. The sample console remains a labeled educational mode.

## Scientific and geographic references

- [ASF GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/): calibrated terrain-corrected gamma-0 backscatter. Convert linear power using `10 log10(power)`.
- [NASA NISAR interferometry](https://science.nasa.gov/mission/nisar/interferometry/): displacement from repeat-pass phase; a nominal 12-day interferometric repeat. Earthquake illustrations are GUNW-style, never displacement derived from GCOV.
- [USGS Everglades coordinates](https://fl.water.usgs.gov/PDF_files/wri03_4287_swain.pdf), [UNESCO Sundarbans location](https://www.unesco.org/en/mab/sunderban).
- [USGS Parkfield instrument](https://escweb.wr.usgs.gov/nsmp-data/GEOS/prk/parkfield_station.html), [USGS Hayward deformation monitoring](https://earthquake.usgs.gov/monitoring/deformation/data/download.php).
- Forest window coordinates are inferred midpoints of [NASA ORNL Rondônia study bounds](https://daac.ornl.gov/LBA/guides/ND01_Georectified_Products.html) and [NASA ORNL Pará survey bounds](https://daac.ornl.gov/VEGETATION/guides/Forested_Areas_Para_Brazil.html).

## Approval checkpoint

The offline download/inspect/process pipeline is implemented and its synthetic software tests pass. Real Everglades suitability remains NOT CLEARED pending official QA, artifact review and common-support masking. See `docs/integration-status.md` for current checks and remaining browser/data dependencies.
