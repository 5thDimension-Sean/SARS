# Trust layer (`/trust`)

A static page that checks what a before/after NISAR backscatter change can and cannot support. It produces **no confidence score and no probability of flooding, damage or vegetation loss** (see `AGENTS.md`).

## What it shows
1. **Evidence readiness**: "N of M conditions met" with every condition visible: grid alignment, official identification-group QA, Frequency A validity, RFI/noise review, numerical grid supplied, HH and HV standing out from background, HH/HV agreement, independent evidence. QA statuses come from `evidence.json`; if `regions.json` says official QA failed, that overrides "unverified".
2. **False-alarm context** (needs a numerical grid): for a pixel box, the median paired dB change is compared with the same statistic for every same-size window elsewhere in the scene. Reported: scene shift (median of background windows), excess beyond it, background spread (95%), and the share of background windows at least as far from the scene shift, `(1 + k) / (N + 1)`, so it is never 0%. At least 30 comparable windows, 400 pixels and 90% valid pixels are required, otherwise the box is refused.
3. **Other explanations**: unranked, no probabilities, all "not assessed" until independent evidence exists.
4. **Report**: self-contained, escaped, printable HTML with provenance, statistics, every condition and limitations.

## Locations
`lib/trust-studies.ts` lists every location. `/trust#<id>` opens one directly.
- **Grid studies** (Everglades, Louisiana, California, Rodanthe, Mamirauá, Hawaiʻi, Etna, and "your own coordinate"): readiness comes from `evidence.json` and `regions.json`; measurements appear once a numerical grid exists. An unpublished study (for example a custom coordinate nobody has processed) shows an empty state.
- **No-NISAR locations** (Padma River, Hubbard Glacier, Sossusvlei): there is nothing to test, so every radar condition shows as not provided. Optical context such as Padma's Landsat images may count as independent evidence but is labelled context only.
- **Adding a location**: add it to `TRUST_LOCATIONS`. `npm test` fails if a published `*-regions` folder is missing from the registry.
- **User-generated locations**: a coordinate processed by `pipeline/generate_unified_evidence.py --site custom` gets the same grid export. Images uploaded on `/upload` are ordinary pictures, not calibrated backscatter, and are never given false-alarm statistics.

## Honest limits
- The rate says how unusual a box is inside its own scene. It cannot detect scene-wide effects (calibration, moisture) and is **not** the probability a physical change occurred.
- Regions A/B/C in every published study were chosen by ranking candidate windows on their own measured difference (the selection text says "exploratory score" or "exploratory HH median ranking"). The page therefore treats every preset as data-selected, fail-closed, and never lets one pass the background conditions. Only a box you draw yourself is a fairer test.
- Pixels and overlapping windows are spatially correlated; the rate is a descriptive statistic, not a p-value. Repeated looks are not corrected; the page shows how many boxes you checked and the expected chance hits.
- Provisional NISAR products fail or have not completed official QA, so no result is cleared for quantitative analysis.

## Data contract
Numbers come only from `{study}-regions/difference-grid.json` plus `{POL}_difference_grid.i16` (little-endian int16, 0.01 dB, `-32768` = no pair, north-up), written by `pipeline/trust_grid.py`, called from `build_everglades_regions.py`, `build_louisiana_regions.py`, `build_california_regions.py` and `pipeline/generate_unified_evidence.py`. Hawaiʻi's region files come from a script not on this branch, so its grid appears only after that script also calls `write_difference_grids`. The exploratory PNGs are display-only and are never decoded. **Without the grid files the page shows only the readiness checklist and an explicit empty state.** Regenerate locally (the build scripts need `EARTHDATA_TOKEN`; the unified generator reads already-processed COGs), then commit the new files under `public/data/*-regions/`:

```sh
python build_louisiana_regions.py
python build_everglades_regions.py
python build_california_regions.py
python pipeline/generate_unified_evidence.py --site rodanthe   # also: amazon, etna-event, custom
```

Grid sizes follow the study (about 0.4 MB per polarization for the 80-pixel studies, up to about 3.7 MB for Mamirauá), so check the repository size before committing all of them.

## Tests
`npm test` (`scripts/trust-metrics.test.mjs`) and `python -m unittest pipeline.tests.test_trust_grid`. Fixtures are synthetic and never shipped.
