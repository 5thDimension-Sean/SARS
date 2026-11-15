# Candidate: Cameron Parish coastline — real NISAR erosion workflow

**Status: candidate only. This is not yet a published TANGO study.** Do **not** replace Iowa, render a difference raster, imply shoreline retreat or expose a measured change until two actual compatible NISAR GCOV products are downloaded, inspected, processed and independently checked.

## Why this site

Cameron Parish along southwestern Louisiana has documented shoreline retreat and a visually meaningful land–water boundary. This case would introduce a different coastline than the existing Mississippi River Delta and add a real shoreline-change validation question. NOAA/USGS baseline data are independent evidence, not a substitute for NISAR observations.

## Stage 1 — discovery, **using the same repository pipeline as Everglades**

From repository root with `pipeline/requirements.txt` installed:

```sh
python -m pipeline.fetch_nisar --bbox=-93.55,29.70,-93.35,29.82 --start 2026-07-01 --end 2026-11-14 --maturity PROVISIONAL --max-results 60 --dry-run
```

Identify at least two HH/HV GCOV acquisitions with the same **track, frame and pass**. Confirm product maturity and version/CRID, source data availability, footprints and matching acquisitions. Refine the search to a compatible pair with `--track` and `--frame`. Acquisition dates must come from the actual products, not from the search interval.

## Stage 2 — download and inspect

Set `EARTHDATA_TOKEN` privately in the same terminal or configure `~/.netrc`, then remove `--dry-run`, adding `--track`, `--frame`, and `--out pipeline/downloads`. Never commit credentials or full raw HDF5. Run:

```sh
python -m pipeline.inspect_h5 pipeline/downloads/YOUR_FIRST_PRODUCT.h5
python -m pipeline.inspect_h5 pipeline/downloads/YOUR_SECOND_PRODUCT.h5
python -m pipeline.nisar_to_overlays --input pipeline/downloads --out pipeline/output/coastal-cameron --aoi=-93.55,29.70,-93.35,29.82 --pols HHHH,HVHV --max-size 2048 --dry-run
python -m pipeline.nisar_to_overlays --input pipeline/downloads --out pipeline/output/coastal-cameron --aoi=-93.55,29.70,-93.35,29.82 --pols HHHH,HVHV --max-size 2048 --png-quantize
```

Use a clean download directory containing only the compatible pair. The command must pass matching-grid/version checks; never use `--allow-mixed-versions` merely to make a visually appealing image.

## Stage 3 — professional erosion analysis

- Inspect NISAR identification QA, noise floor, RFI, exception masks, water/land invalid pixels, tidal stage and geometry for each acquisition.
- Generate fixed-scale **10 m source-resolution** HH/HV previews (when source pixels are 10 m), histograms, provenance, masked numerical differences and confidence/QA flags. The pipeline's optional reduced-resolution COGs must be labeled by their **actual output pixel size** rather than called 10 m imagery.
- Determine land/water boundary candidates from numeric backscatter with masking and threshold sensitivity. Water brightness changes alone cannot establish erosion.
- Retrieve independent USGS dated shorelines (DSAS or coastal shoreline datasets), account for the tide/water level and assess positional uncertainty. Report **candidate boundary change**, not erosion rate, unless validation supports a physical shoreline shift.
- Commit a verified image manifest and source IDs; only then promote this location to `frontend/lib/places.ts`, replacing Iowa in the featured globe journey while preserving its existing investigation URL.
- Compare at identical geographic extent and fixed dB display scales; no per-date contrast stretching.

## Review gate

- [ ] Two product IDs and real acquisition dates recorded
- [ ] Track/frame/pass/version, geocoding, HH/HV grids compatible
- [ ] HDF5 read and valid common-pixel masks checked
- [ ] QA, banding, RFI, and shoreline/water-level ambiguity documented
- [ ] Real before/after PNGs and georeferenced difference and numerical grid exported
- [ ] Independent USGS shoreline reference sourced with temporal mismatch acknowledged
- [ ] All imagery visibly distinguishes **NISAR backscatter** from **validated shoreline erosion**
- [ ] Tests/lint/build and desktop/mobile browser comparison pass

Reference: https://nisar-docs.asf.alaska.edu/earthdata-search/ and https://www.usgs.gov/centers/whcmsc/science/digital-shoreline-analysis-system-dsas
