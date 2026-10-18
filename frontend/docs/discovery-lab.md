# SAR-Waltz Discovery Lab — data-ready features

The Explore page has six connected tools. The shipped demo has **no observed NISAR data**. These tools are designed to work with newly processed data after NASA releases suitable scenes. Features gracefully indicate when data is unavailable; the site does not make unsupported detection claims.

| Discovery tool | What works now | What activates when real files are added |
|---|---|---|
| Investigate | Click any sample map to mark an illustrative point; explain what's missing | Inspect local average HH/HV dB from paired small, validated numerical grids; report matching valid-cell count. This is an **overview**, not a full-resolution event or area estimate |
| Radar / Optical | Explain why radar is different; explicitly say no comparison image is present | A toggle shows locally supplied, spatially aligned optical imagery **with a date, provider and attribution** beside radar |
| Check Evidence | Show observed-vs-sample status, distinct dates, polarization, version consistency, matched difference overlay, and independent verification as explicit checklist rows | Check the same conditions on processed GCOV acquisitions. Independent verification remains unconfirmed until humans assess it |
| Earth's Waltz | Play real UI timeline through illustrative acquisition dates | Synchronize imagery playback and the actual available acquisition dates; plot measured **frame-wide** mean dB as a trend, not a pixel-level series |
| Make a Report | Download a labeled HTML one-page investigation/evidence report suitable for printing as PDF | Include real traceable acquisition dates, source, version, matched change status, approximate local ROI values if available, and a measured frame-wide dB chart |
| 1-Minute Tour | Navigate a concise five-step guided explanation from selecting a location to scientifically interpreting results | Uses the same steps for real study scenes |

## 1. First NISAR data delivery
1. Obtain real NISAR L-band GCOV HDF5 scenes covering the same geographically comparable track/frame/pass and at least two dates. Verify the rights and release maturity.
2. Follow \`pipeline/README.md\` to inspect and convert raw HDF5 into precomputed raster PNGs, cloud-optimized GeoTIFFs and a versioned \`manifest.json\`.
3. The pipeline additionally writes \`<acquisition>_HH_roi.json\` and \`<acquisition>_HV_roi.json\`, 96×96 georeferenced, nullable dB overview grids. They use the same target Web Mercator footprint as the associated PNG. These grids are **coarse previews**; they cannot support precise affected-area claims.
4. Place **all** generated files, including the manifest, under \`frontend/public/data/\`. Publish via Next.js/GitHub Pages.
5. If there is a valid, co-registered **optical image**, place the local image alongside its date and provenance. Add the optional object below to its acquisition in the manifest. **Do not add an optical placeholder when none exists.**
6. Run \`npm test\`, \`npm run build\`, verify first/last dates and the exact pair change overlay, and manually verify map point/geographic alignment against independent known locations.

Example optional manifest fields on each acquisition (output paths are relative to \`frontend/public/data/\`, with no leading slash):
\`\`\`json
{
  "roiGrid": {
    "HH": "T001_F001_A/20261010_HH_roi.json",
    "HV": "T001_F001_A/20261010_HV_roi.json"
  },
  "optical": {
    "url": "T001_F001_A/optical_20261010.webp",
    "date": "2026-10-10",
    "source": "Actual provider and product",
    "credit": "Actual required attribution"
  }
}
\`\`\`
*Example paths and dates are illustrative; they are not a claim that these products exist.*

Numerical grid data schema:
\`\`\`json
{
  "schemaVersion": "1.0",
  "type": "gamma0-db",
  "width": 96,
  "height": 96,
  "pol": "HV",
  "date": "2026-10-10T00:00:00Z",
  "values": [null, -15.7, -17.2]
}
\`\`\`
The real \`values\` array must contain exactly 9,216 nullable finite values. The tiny three-value array shown here illustrates the data type only, and is **not a valid grid**.

## 2. Scientific interpretation and limitations
- A map point uses a small seven-pixel-diameter neighborhood of the reduced 96×96 overview grid and includes only **matched valid** before/after cells. Numeric dB differences indicate radar response, not a vegetation-loss or inundation classification.
- The display stores source-normalized coordinates after undoing the map's current pan/zoom and uses the same projected footprint to calculate latitude/longitude. Validate the optical co-registration offline.
- Frame-wide mean dB over time is not a per-pixel signal series. The interface distinguishes these statistics clearly.
- Same-day selection, missing numeric grids, missing polarizations and missing optical all produce explicit unavailable states; no colors are interpreted as measurements.
- Do not equate checklist completion with a confidence probability or scientific validation.
- Identifying *actual* flooding, earthquake displacement or impacted area requires compatible products, physical interpretation, masks, geometry and independent data.

## 3. Regression checklist
- Desktop: open/close six tools; click Investigate on map; zoom and right-click-drag without losing pin alignment; fullscreen and exit; expand/collapse scientific explanation; resize timeline and side panels; play/step acquisition sequence; download report.
- Mobile: tabs scroll or collapse to icons; floating drawer closes and does not trap critical map controls; selection still works.
- Fresh sample install: no valid numerical ROI is shown, no fake optical raster, no measured trend or detection label.
- Real processed output: all numerical grids match date, polarization and width/height; invalid data is rejected; masked cells are excluded; independent-validation row remains pending.

For code standards and review, see the repository root \`AGENTS.md\`.
