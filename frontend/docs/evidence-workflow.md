# Evidence-first SAR-Waltz investigation workflow

SAR-Waltz presents **Where / How / Evidence** directly above the comparison viewport. The panel reacts to the region, dates, and polarization selected in the workspace. The **Evidence note** button opens an exportable plain-text report with acquisition and provenance information.

## What visitors see

| Area | Demo today | With processed NISAR GCOV |
|---|---|---|
| Where | Real reference coordinates, fictional illustrated pixels | Geographic frame center from the manifest, with a link to the geospatial map |
| How | Simulated before/after dates and textures, labeled SAMPLE | Real acquisition dates and HH/HV backscatter; a dated difference overlay appears only when the pipeline generated one for that exact pair |
| Evidence | Explicit statement that no surface change is observed | Source, product processing version, availability of matched backscatter difference, scientific caveats, processing warnings, and exportable evidence note |

**Do not call the backscatter-derived difference a flood, deforestation, or earthquake detection.** A decreased or increased return may have more than one cause; quantification of affected habitat or displacement needs additional methods and validation.

## Connecting the first actual NISAR observations

1. Choose **one geography and one phenomenon**. The Everglades wetland radar response is a useful first demonstration. Use a small AOI to reduce processing time.
2. Search [ASF Vertex](https://search.asf.alaska.edu/) for **NISAR L-band GCOV** acquisitions. Confirm real availability and comparable **track/frame/pass**, processing version, polarization, maturity, AOI coverage, and dates. Fictional sample dates do not establish availability.
3. Follow [pipeline/README.md](../../pipeline/README.md): dry-run catalog search, download authenticated HDF5, inspect the product, dry-run the processor, then generate scaled image overlays, matched-pair differences, COGs, and manifest.
4. Copy the entire validated pipeline output, including manifest.json, into frontend/public/data/; rebuild the static site. The existing loader discovers **Processed GCOV** without removing fictional studies.
5. Verify map linking, date selections, HH/HV availability, source and maturity labels, and whether the chosen date pair has a precomputed difference overlay. Other date pairs must not show an invented difference.
6. Compare findings with independent water-level, optical, or field data before labeling a physical change or estimating any impacted area. Preserve provenance and validation limitations in the exported evidence note.

NISAR **GCOV** measures terrain-corrected radar backscatter, not ground displacement. Earthquake motion requires suitable repeat-pass interferometric products such as GUNW and a separately validated workflow.

The GitHub Pages site is static; users cannot upload massive HDF5 products directly into the page. Process data offline, inspect output, commit only appropriate derived assets, and let the frontend consume the manifest and overlays. The original sample dataset remains visibly fictional.
