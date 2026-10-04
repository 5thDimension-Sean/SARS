# SAR-Waltz Frontend Redesign Prompt

Copy everything below the line into your coding agent, run from `frontend/`.

---

## 1. Objective

Redesign the existing SAR-Waltz frontend (Next.js static export, React 19, Tailwind v4 tokens, Radix/shadcn, Lucide, Recharts) as a **NASA mission-operations console** for explaining synthetic aperture radar (SAR). Do not rebuild from scratch: refactor the components in `components/dashboard/` and `app/globals.css`, keep `data/sample-data.json`, `lib/sample-schema.ts`, `lib/manifest-adapter.ts`, and `npm test` / `npm run build` working.

The single organizing rule: **the selected acquisition phase is the single source of truth.** Viewport imagery, before/after comparison state, metrics, status labels, chart series, acquisition metadata, insight copy, map annotations, and timeline position all derive from one selection `{phenomenonId, locationId, baselineIndex, acquisitionIndex, polarization/layer}`. No component keeps its own copy of phase state or derives it independently. Moving the timeline updates all of them in the same render.

## 2. Non-negotiable retained behavior

Do not remove or weaken any of the following.

**Phenomena and locations (real coordinates, fictional data):**
| Phenomenon | Analysis | Location | Coordinates | Orbit / Frame / Pass | Product |
|---|---|---|---|---|---|
| Wetland loss | Backscatter (dB) | W-01 Freshwater mosaic, Everglades · Florida (area 281 km²) | 25.6153, -80.7031 | 4200 / 60 / ASC | GCOV HH+HV |
| | | W-02 Tidal delta mosaic, Sundarbans · India (324 km²) | 21.9052, 88.6191 | 4250 / 64 / DESC | GCOV HH+HV |
| Earthquakes | LOS displacement (cm) | E-01 Fault corridor A, Parkfield · California (196 km²) | 35.8942, -120.4212 | 4380 / 91 / ASC | GUNW HH |
| | | E-02 Fault corridor B, Hayward · California (218 km²) | 37.68, -122.092 | 4430 / 95 / DESC | GUNW HH |
| Deforestation | Backscatter (dB) | F-01 Forest frontier A, Rondônia · Brazil (412 km²) | -10.1277, -63.6783 | 4560 / 122 / ASC | GCOV HH+HV |
| | | F-02 Forest frontier B, Tapajós · Brazil (368 km²) | -2.9515, -54.9595 | 4610 / 126 / DESC | GCOV HH+HV |

Read all values from `data/sample-data.json`; the table is a checklist, not a second source. Keep location aliases and search (Ctrl/Cmd K, arrows, Enter; e.g. everglades, sundarbans, parkfield, hayward, amazon, tapajós, santarem).

**Acquisitions:** seven per location: 2026-07-03, 07-15, 07-27, 08-08, 08-20, 09-13, 09-25. Cadence is 12 days (nominal repeat) except the **24-day gap between 08-20 and 09-13, which must stay visible and contain no invented intermediate pass.** Keep baseline selection, per-acquisition `productType`, polarization, orbit, frame, pass direction, `productVersion: ILLUSTRATIVE`, reference date, backscatter normalization (gamma0), and units.

**Measurements (per acquisition, per location, sample values):** primary metric, comparison footprint (km²), and signal metric. Wetland/forest: flagged change in km² and median HV backscatter in dB. Earthquake: peak LOS displacement in cm and coherence (0–1). Keep status values (NOMINAL / WARN / ALERT) and the per-location events (e.g. wetland and forest "Sample change detected", earthquake "Sample displacement review", all "Sample review marker" on 2026-09-25).

**Charts:** dB histograms (64 bins, HH/HV, y-axis = pixel frequency %) for wetland and forest; displacement profile (distance km vs LOS cm, positive = toward sensor, first acquisition as reference) and wrapped-phase view for earthquakes.

**Interaction:** before/after swipe comparison (draggable and keyboard-operable handle), change-highlight / boundary / coordinate-grid toggles, zoom, recenter, expand viewport (Escape closes), HH/HV selection, displacement vs wrapped-phase selection, Signal and Acquisition tabs, playback at 0.5×/1×/2× that pauses at the final acquisition, Left/Right/Home/End acquisition stepping (suppressed inside text inputs, sliders, tabs, menus), compact-width Layers and Analysis overlays with focus trap and focus return, Processed GCOV manifest category and `DERIVED GCOV` badge when a manifest loads, and the empty-sample-sentinel behavior from `lib/manifest-adapter.ts`.

## 3. NASA-based educational content

**Content authority:** NASA Earthdata SAR learning material, <https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar> (confirm the URL resolves before citing it). Supplement only where needed with NASA-linked SAR interpretation material (e.g. NASA NISAR science pages, ASF SAR guides), and keep the existing references in the README. **Paraphrase concepts in original short copy; do not paste long passages.** Show a "Source" footer link per learning panel.

Create a concise, progressive "How SAR sees this" layer (a collapsible side panel or drawer, not a wall of text). Each topic is 1–3 sentences plus, where useful, a small diagram drawn with SVG:

1. **Active microwave sensing**: SAR transmits its own microwave pulses and records the echo, so it works day and night and sees through cloud and most weather.
2. **Synthetic aperture**: motion along the orbit is used to synthesize a long antenna and fine along-track resolution.
3. **Amplitude / backscatter**: echo strength depends on how much energy returns to the sensor; shown in dB (gamma-0 for GCOV). Lower dB = less return.
4. **Phase and interferometry**: phase of the echo encodes range; differencing phase between repeat passes (InSAR) yields line-of-sight motion on the order of centimeters or smaller; wrapped phase appears as repeating fringes. Coherence measures how well the two passes match.
5. **Wavelength and band**: shorter bands (C, X) interact with leaves and surface; longer bands (L, as in NISAR) penetrate deeper into vegetation.
6. **Polarization**: HH, HV, VV, VH describe transmit/receive orientation; HV (cross-pol) is sensitive to volume scattering such as canopy.
7. **Surface roughness and moisture/dielectric response**: smooth water reflects energy away (dark), wetter soil and vegetation return more.
8. **Scattering mechanisms**: surface, volume, and double-bounce (e.g. flooded vegetation produces bright double-bounce return).
9. **Interpretation limits**: speckle, radar shadow, layover, foreshortening, and look-direction/pass-direction effects. Each phenomenon's existing `limitation` copy stays and links to the relevant topics.

**Mode-specific "What you are looking at" copy** (replaces generic explanation; updates with phase):
- Wetland: smooth open water lowers backscatter; flooded vegetation can raise it via double-bounce; HH vs HV tell different stories; a decrease is **not** proof of wetland loss (water level, season, geometry).
- Earthquake: LOS displacement in **centimeters** from repeat-pass phase; positive = toward the sensor; coherence drops mean unreliable phase; this is GUNW-style illustration, **never derived from GCOV**.
- Deforestation: L-band HV drop where canopy volume is removed; **backscatter in dB** with polarization and baseline/comparison dates stated; moisture, flooding, and processing differences can mimic loss.

Phase-aware insight text: a single sentence derived from the selected acquisition (e.g. "Comparing 2026-09-25 against baseline 2026-07-03: HV median −19.2 dB. SAMPLE DATA"), generated from fixture fields, never hand-typed per phase.

## 4. Interaction model

- **Selection state:** one reducer/store (`useReducer` or small context) holding the selection above; everything else is a pure function of `(fixtures, selection)`. Add a derived-selectors module with unit tests.
- **Discrete selection, smooth visuals.** "Smooth" means *visual interpolation only*. The underlying acquisition index is always an integer among the fixed acquisitions; keyboard and screen readers see only discrete stops. There is never an intermediate "fake" acquisition, and the 24-day gap stays a gap. Playback advances index by index; the transport thumb, comparison reveal, chart series, and numbers animate between stops over ~300–600 ms with easing, then settle exactly on the stop value.
- **Transport bar (replaces the large bottom timeline):** a slim single-row bar: play/pause button, current acquisition date (and baseline date), a track with **discrete acquisition ticks** at true time spacing, visible **gap marker** for 08-20 → 09-13, **event markers** (WARN/ALERT) at their dates, a compact speed control (0.5×/1×/2×, a single cycling or select control), and a thumb that eases between ticks. Ticks are focusable via a proper slider (`role="slider"`, `aria-valuetext` = date + acquisition number + status) or listbox; click/tap a tick jumps there. Home/End/Left/Right/Space behave as today.
- **Number tweening:** metric values, dB readouts, and displacement tween between phase values (≤500 ms, `requestAnimationFrame`, cancel on rapid change); final displayed value always exactly equals the fixture value, with units and decimals unchanged.
- **Map crossfades:** imagery for the new phase crossfades over the old; change overlay and annotations fade with it. Chart series interpolate (Recharts animation or custom), histograms morph bin-by-bin.
- **Annotations follow phase:** hotspot markers, change polygons, scale/coordinate labels, and the event flag shown in the viewport reflect the selected acquisition and baseline.
- **Replaceable Earth viewport:** keep the `ObservationViewportProps` contract. Add a globe/Earth context (location selector overview) behind the same kind of interface, e.g. `EarthViewport` with props `{ center, bounds, imageryLayers, overlays, annotations, selection, onSelectLocation }`, so MapLibre/Cesium/deck.gl can replace the procedural renderer without touching presentation components. No new heavy map dependency is required.
- **Fixtures:** all presentation components consume only pure JSON-serializable fixtures (no functions, JSX, Dates, class instances, or Infinity/NaN) validated by `lib/sample-schema.ts`. Add any new fields (learning topics, annotation specs) as JSON in the schema, bump `schemaVersion` only if breaking, and keep `scripts/generate-samples.mjs` reproducible. A future real pipeline output must be able to replace the fixtures with no component changes.

## 5. Visual direction

**Aesthetic:** NASA mission operations / flight-dynamics console, grounded in real aerospace interfaces, not a generic "AI dashboard".

- **Palette (as semantic tokens in `globals.css`, light-on-dark only):** deep space-black background (~`#05070b`), neutral charcoal panels (~`#0e1116`/`#151922`), off-white text (~`#e8eaed`), muted gray secondary text, **NASA red** (~`#fc3d21`) used sparingly for brand marker, alerts, and the active event, **instrument cyan** (~`#4fd1e8`) for data traces, selection, and focus. Keep status colors (nominal/warn/alert) distinguishable beyond hue (icon + label).
- **Hierarchy:** fewer boxed cards; use thin 1 px separators, section rules, and generous alignment on a precise grid. Crisp type: a neutral grotesque for UI and a tabular monospaced face for numerals, coordinates, dates, and IDs (`font-variant-numeric: tabular-nums`). Functional uppercase micro-labels (e.g. `ORBIT 4200 · FRAME 60 · ASC`). Border radius ≤ 2–4 px.
- **Avoid:** neon gradients, glowing blobs, heavy glassmorphism/backdrop blur, pill-heavy controls, drop-shadow glows, decorative sci-fi HUD clutter, emoji.
- **Texture:** subtle Earth-at-night imagery (generated procedurally or a small inline asset, low contrast) behind the Earth viewport; fine grid lines, graticule, and an **orbital trace** (thin ellipse/ground-track) in cyan with a small satellite marker.
- **Motion (purposeful only):** slow globe drift; restrained orbital sweep (a faint scan line that moves with the playback/orbit and pauses when playback pauses); smooth chart interpolation; number tweening; map crossfades; timeline easing. Motion is driven by playback or phase change; never decoration that loops with nothing happening. Under `prefers-reduced-motion: reduce`: no drift, no sweep, no tweening, no crossfade duration, charts non-animated, transport thumb jumps; state changes remain instantly visible.
- **Layout (desktop):** top mission bar (brand, phenomenon switch, location, search, `SAMPLE DATA` indicator) → left observation/Earth rail → central viewport with comparison handle and overlay toggles → right analysis rail (Signal / Acquisition / Learn tabs) → slim transport bar pinned to the bottom.

## 6. Responsive behavior

- **≥1280 px:** three-column console as above. **768–1279 px:** two columns; analysis rail becomes a collapsible lower panel. **<768 px:** viewport first; Layers and Analysis (including Learn) open as full-height overlays/sheets that trap focus, return focus to the opener, and close with Escape/back control; the transport bar stays pinned, thumb-reachable (≥44 px targets), with date and play/pause always visible, speed control compact, ticks scrollable or condensed without losing the gap marker.
- No horizontal page scroll at 320 px; dynamic viewport units for mobile browsers; safe-area insets respected.

## 7. Accessibility

- WCAG 2.2 AA contrast on dark surfaces (check cyan/red on charcoal); visible 2 px focus rings; every control has an accessible name; icons are not the only signal for status.
- Full keyboard operation: Tab order follows visual order; Left/Right/Home/End step acquisitions; Space toggles playback when focus is on the transport; swipe handle responds to arrow keys (with Shift for larger steps); Ctrl/Cmd K search; Escape closes expanded viewport/overlays; no keyboard traps outside intentional dialogs.
- `aria-live="polite"` announcement on phase change ("Acquisition 5 of 7, 2026-08-20, Frontier A, HV median −18.0 dB, status WARN, sample data"), debounced during playback.
- Charts have text alternatives and a data-table view/toggle; color is never the only series differentiator (dash patterns/markers).
- Respect `prefers-reduced-motion`, `prefers-contrast`, and 200% zoom/text resize.

## 8. Data integrity

- Every metric, chart, annotation, and image in the UI carries an explicit **`SAMPLE DATA`** label (persistent mission-bar badge plus per-panel labels); processed manifest data uses `DERIVED GCOV` and stays visually and textually separate.
- Do not imply a live NASA feed: no "live", "real-time", "streaming", or NASA-endorsement wording; NASA branding limited to a tasteful, non-official "inspired by" styling and attribution of educational sources; do not use the NASA logo or "meatball" unless usage guidelines permit.
- Do not attach fabricated values to named real events (no real earthquake names/magnitudes/dates). Coordinates are real; changes are fictional. Keep the "Earthquake analysis is not derived from GCOV" and "backscatter decrease is not proof of loss" disclaimers.
- Units fixed: earthquakes in **LOS displacement cm** (positive toward sensor); wetland and forest in **backscatter dB** with polarization and baseline/comparison dates shown wherever the value appears. Histogram y-axis in pixel frequency %.
- Components never compute scientific values themselves; they format fixture values. Add tests so any component receiving non-finite numbers, wrong units, or `provenance !== "sample"` (outside the manifest path) fails validation visibly.

## 9. Acceptance criteria / verification

Run `npm test` and `npm run build` (must pass), then verify in a browser at 1440×900 and 390×844:

1. **Phase synchronization:** for each of the 6 locations and each of the 7 acquisitions, step via tick click, Left/Right, Home/End, and playback; after the animation settles, viewport imagery, comparison state, metrics, status chip, chart series, acquisition metadata (date, orbit, frame, pass, product, polarization, version), insight sentence, and annotations all match the same fixture index. Automated test: a selector-level test plus a Playwright check that reads the DOM at each stop. During rapid input no stale mixed-phase state remains after settling.
2. **All three phenomenon modes:** wetland and forest show dB metrics/histograms with HH/HV and comparison dates; earthquake shows LOS cm profile, wrapped-phase toggle, and coherence, with no dB wording. Switching phenomenon/location resets sensibly and preserves nothing stale.
3. **Retained data:** values in the UI equal `data/sample-data.json` (spot-check table in section 2); 24-day gap visible with no intermediate acquisition; events at correct dates; search aliases work.
4. **Mobile panels:** Layers and Analysis/Learn overlays open, trap focus, return focus, close with Escape; transport bar usable one-handed; no horizontal scroll at 320 px.
5. **Keyboard controls:** all behaviors in section 7 work without a pointer; shortcuts are suppressed in inputs/sliders/tabs/menus.
6. **Reduced motion:** with `prefers-reduced-motion: reduce` emulated, no drift/sweep/tween/crossfade, charts static, state still correct.
7. **Explicit provenance:** `SAMPLE DATA` visible on every screen state and every data panel; no "live" language anywhere (grep test); manifest path still shows `DERIVED GCOV` separately.
8. **Replaceability:** swapping the procedural viewport for a stub implementing the viewport interface, and swapping fixtures with a differently-valued but schema-valid JSON file, requires no edits to presentation components (demonstrate with a test or short note).
9. Update `README.md` and `docs/verification.md` with new interactions, the Earthdata source, and screenshots (desktop + mobile) of each phenomenon mode.

Report anything you could not verify, rather than claiming it passed.
