# SAR-Waltz Engineering Playbook

Project instructions for contributors and coding assistants (inspired by the open-source ECC software-development workflow; ECC is **not** installed in or controlling this repository).

## Product and scientific contract
- SAR-Waltz is an educational NASA Space Apps application. **Sample mode is fictional.** Never display fake numbers or textures as NASA detections, observations, flood area, deforestation, or displacement.
- GCOV provides calibrated radar **backscatter**, not ground displacement. Changes in backscatter may have many causes; require independent evidence to state a physical cause.
- The NISAR product-processing pipeline is offline; the public GitHub Pages frontend is static. Do not suggest users can upload raw HDF5 into the website.
- UI features requiring source products must show truthful empty states until corresponding validated assets exist. No placeholder optical imagery masquerading as measured imagery.
- Every numerical ROI must be derived from validated numerical grids, compatible polarization and dates. Do not calculate dB differences by subtracting RGB values of a displayed PNG.
- Real product citations, source, acquisition date, polarization, version, maturity, masking and relevant caveats belong in evidence reports.

## Change management
1. Define acceptance criteria and scientific edge cases before implementing substantial changes.
2. Use feature branches and pull requests for development. Do not merge failed checks.
3. Add focused automated tests, including missing data, masked pixels, invalid input, matching acquisition dates and unsafe report text.
4. Run \`npm test\`, \`npm run lint\`, and \`npm run build\` inside \`frontend/\`. Run Python pipeline tests for pipeline edits.
5. Verify real user journeys in a browser on desktop and small viewport: selecting a study, before/after slider, fullscreen, right-click pan, resize handles, date playback, tool panels, evidence checklist and report download. A successful build **does not prove visual interactions work**.
6. Review diff for XSS, third-party asset/privacy risks, unsanitized URLs, broken responsive layout, floating-panel overlap, labeling errors and scientific overclaim.
7. Preserve old public URLs and GitHub Pages basePath configuration. Never rename or transfer the repository without repository-owner approval.

## Feature acceptance checklist
- No real data: site loads, all six Discovery Lab tabs explain their purpose, no fake measured statistics.
- First actual processed GCOV manifest: valid images, dates, histogram, metadata, numerical ROI grids, real signal-time-series.
- Insufficient products: no fabricated temporal differences, measured pixel comparisons, or event detection.
- Optical imagery: only locally supplied, aligned imagery with date/source/credit. Clearly distinguish it from radar.
- Evidence checker: failed conditions remain visible; never label overall results as scientific confidence.
- Report: downloaded HTML escapes strings, prints clearly, includes provenance and missing-data limitations.
- Accessibility: all tabs have accessible names, buttons have focus rings, the radar remains usable with the analysis drawer closed.

Do not blindly copy all ECC agents, hooks, installers or shell commands into this repository. Prefer a small, reviewable workflow tailored to this app.
