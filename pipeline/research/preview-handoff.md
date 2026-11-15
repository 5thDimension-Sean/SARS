# Worldwide internal research preview

The separate `/research-preview` route adds Hubbard Glacier, Sossusvlei, Krasheninnikov (Russia), Mozambique, Sri Lanka, Antarctica, Etna, Sumatra and Queensland. Existing investigations and their data remain unchanged. No merge or deployment has been performed. The route is marked noindex; that is an indexing preference, not authentication or access control.

Hubbard's active story now uses NASA's published GSLC-derived visualizations from **November 26 and December 8, 2025**, spanning the December 6 earthquake. The October 2026 browse assets remain archived, and their screening counts do not transfer to the new dates. The event-pair source granules and independent QA are still pending. Prior identification QA failures have not been cleared.

Russia and Mozambique display publisher-provided NISAR change visualizations. Sri Lanka's mixed-sensor comparison and Antarctica's single scene are explicitly labeled; they do not become quantitative same-sensor temporal pairs. Etna, Sumatra and Queensland remain candidate entries with no substitute radar imagery, acquisition dates or measurements. Sossusvlei displays its four catalog-MD5-verified scene browse images with HH/HV selection.

All nine entries remain **BLOCKED / EXPLORATORY_NOT_CLEARED**. Images are for visual review. No PNG intensities are subtracted and no flood area, lava area, displacement or causal classification is computed. Each study's downloadable JSON preserves provenance, limitations and null numerical measurements.

The catalog is `frontend/lib/research-catalog.json`; its runtime validator rejects status upgrades, fabricated measurements, unsafe sources and mismatched dates. Local image integrity is recorded in `frontend/public/research-media/local-assets.json`. Publisher media without a local copy is loaded from its credited source, with a visible failure state when unavailable. The large Antarctic image and animated ISRO scene require an explicit load click. The NASA volcano video does not autoplay.

For local review, build and serve this research worktree on a separate port, then open `/research-preview#hubbard`. No existing development server needs to be replaced. Source publication dates, scene dates and event windows are kept distinct; unknown acquisition dates are left unknown.

Validation: all 57 frontend tests and 149 Python pipeline tests pass. Lint, the production build, and the static-export asset/hash audit pass. The research route, new Hubbard dates, all nine location names, noindex metadata and local asset hashes are present in the exported files. Desktop/mobile browser journeys could not be verified: the browser timed out connecting to localhost and the terminal denied socket connections (WinError 10013). This limitation remains open; a build is not visual verification.
