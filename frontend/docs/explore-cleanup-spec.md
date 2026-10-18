# Explore interface — precise cleanup specification

Goal: make the map the primary focus, without removing any tool or weakening scientific provenance. All disclosures and menus must be keyboard-accessible and work with sample and processed-GCOV locations.

## Exact default state

| Area | Default | User can still access |
|---|---|---|
| Bottom status strip | Removed from visual layout | Data mode in mission bar and left Data Status; load failures via manifest warning |
| Map | Largest remaining viewport; coordinate grid **off** | Fullscreen, +/− zoom, right-drag pan, before/after swipe, map layers, marker inspection |
| Selected location label | Small heading on map | Region details, coordinates, before/after tags, provenance |
| Left: Change types | Visible buttons | All wetland, earthquake, forest, GCOV categories (as available) |
| Left: Places | **Open** | All original locations and direct switching |
| Left: Map Options | **Closed** | Highlight changes, area outlines, coordinate grid, each as original toggle |
| Left: Data Status | **Closed** | Sample vs derived caveats and lack of live telemetry |
| Right: Change Summary | **Open** | Original metrics, changes, badges, secondary statistics and caveats |
| Right: Radar Settings | **Open** | Polarization and earthquake view selector |
| Right: Charts & Data Details | **Closed** | Signal chart, comparison insight, acquisition metadata, processed product download |
| Right: What Am I Seeing? | **Closed** | Full explanation and scientific limitation |
| “What can the radar actually tell us?” | **Closed** | Where/How/Evidence panel, quick date presets and glossary |
| Discovery Lab | **Collapsed** to one “Explore tools” launcher, with sample/GCOV status visible | Investigate, Radar/Optical, Check Evidence, Earth’s Waltz, Make a Report, 1-Minute Tour |
| Choose Before & After | Visible floating panel with tighter padding | Baseline/date selection, play/pause, playback rate, timeline resize handles |

## Visual design rules

- Remove redundant visual footer; preserve the original data-status message in accessible primary navigation.
- Soften only cosmetic shading, scan texture, and grid opacity. Do **not** change real GCOV pixel values, raster LUT ranges, colorbar scientific scale, or change detection computations.
- Minimize titles and date-chip padding; maintain legibility and focus indicators.
- Keep every sidebar/timeline resize affordance and its original maximum-size constraint.
- Keep the central radar viewport dynamically filling horizontal width released by sidebars.
- A collapsed tool must not unmount or discard the underlying dataset; reopening restores the available actions.

## Acceptance and regression

Run: `npm test`, `npm run lint`, `npm run build`, Python processing tests, and Chromium browser journeys in GitHub Actions.

Test in a real browser:
1. Confirm footer is absent, grid defaults off, sample/derived status remains visible.
2. Open/close Places and verify selections still work.
3. Open Map Options, switch grid on/off, and verify the map responds.
4. Open Charts & Data Details and access both chart and full acquisition metadata.
5. Open Explore tools and access all six tools without losing the selected map point.
6. Confirm right-click panning, fullscreen, swipe, slider date selection, sidebars and timeline resizing.
7. Confirm real-data empty states still avoid fictional radar measurements and unsupported detections.
8. Confirm mobile tool menu and analysis sheet remain usable.

No NISAR data are added by this UI pass. Scientific evidence checks and offline data-loader contracts are unchanged.
