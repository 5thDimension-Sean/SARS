# Six-study QA disclosure review

## Scope and acceptance

Isolated branch: `feat/tango-qa-disclosures`, based on fetched
`origin/feat/tango-dubai` at `0cf569d6b1eab3e7deb04cd70d4d577c1d4a5a69`.
The Dubai working tree and `feat/tango-three-new-locations` research worktree
remain untouched. Nothing is staged, committed, pushed, merged or deployed.

Acceptance: disclose the two reproduced metadata failures for the exact twelve
audited acquisitions; preserve official FAIL and unresolved scientific
clearance; do not suggest these are the only possible failures or proof of
invalid pixels/geolocation. Preserve all other data fields, imagery, screening,
interaction behavior and deployment settings. Keep Hubbard/Sossusvlei blocked.
Fictional or unrelated reports must not inherit real-product failures.

## Changes by study

- Everglades, Louisiana, California: replace the unspecified identification FAIL
  explanation in each evidence JSON with the two reproduced checks and their
  limitations. The existing FAIL status and every other field remain unchanged.
- Hawaii, Iowa: retain all existing data/status/warnings and add an explicit
  `identificationQa` disclosure to each summary, addressing the previously
  generic unresolved-QA warning.
- Palm Jumeirah: retain its existing identification-failure warning and add the
  same precise disclosure to its summary.
- All six: show the shared disclosure immediately above comparison controls,
  with a downloadable source audit for the exact twelve acquisitions. Homepage
  location cards and radar introductions explicitly state that the data remain
  exploratory and identification QA failed. The homepage count now says six.
- The existing fictional-sample HTML report remains fictional and unverified;
  it is not relabeled with failures belonging to real study products. The new
  downloadable QA JSON carries raw official rows, metadata, artifact hashes,
  bounded-read audits and version-matched rule sources.

## Exact files changed

Modified:

1. `frontend/components/hawaii-study.tsx`
2. `frontend/components/investigation/radar-hero.tsx`
3. `frontend/components/iowa-study.tsx`
4. `frontend/components/nisar-prototype.tsx`
5. `frontend/components/palm-study.tsx`
6. `frontend/components/story-map.tsx`
7. `frontend/lib/faq.ts`
8. `frontend/public/data/california-evidence/evidence.json`
9. `frontend/public/data/everglades-evidence/evidence.json`
10. `frontend/public/data/hawaii-review/hawaii-summary.json`
11. `frontend/public/data/iowa-review/iowa-summary.json`
12. `frontend/public/data/louisiana-evidence/evidence.json`
13. `frontend/public/data/palm-review/palm-summary.json`

Added:

14. `frontend/components/identification-qa.tsx`
15. `frontend/lib/identification-qa.ts`
16. `frontend/public/data/identification-qa-audit.json`
17. `frontend/scripts/identification-qa.test.mjs`
18. `pipeline/docs/qa-disclosure-review.md`

Temporary browser tools, scripts, results and screenshots are in ignored
`pipeline/output/`; dependency manifests/lockfiles were not changed. The new
worktree uses a local node_modules junction to the existing installation.

## Verification

- Six-study baseline Python pipeline: **140 passed**, 60 existing Affine
  deprecation warnings.
- Separate preserved research pipeline: **170 passed**, 61 existing Affine
  deprecation warnings, including corrected exception-mask regression coverage.
- Frontend: **59 passed**, including five new disclosure/preservation tests.
- ESLint: passed. TypeScript: passed as part of the production build.
- Production static build: passed; existing Node deprecation warning remains.
- `git diff --check`: passed.
- Semantic comparisons and permanent baseline-payload hash tests confirm all
  six JSON files are unchanged except their intended disclosure fields.
- Isolated headless Chrome: all six studies at 1440x1000 and 390x844; selection,
  HH/HV switching, side-by-side/difference/swipe controls, sliders, QA evidence
  downloads, and disclosure containment passed. Desktop original-study map
  fullscreen entered/exited successfully. Screenshots inspected.
- Homepage: six investigation links, all six Discovery Lab tabs, and downloaded
  HTML report's fictional-sample and scientific-limitation labels verified.
- Desktop sample timeline play/pause, three panel-size controls, and right-button
  pan interaction passed. The expanded sample dialog's exit button can be
  outside the viewport; Escape closes it. This was reproduced in the unchanged
  baseline and retained as a separate pre-existing layout issue, not silently
  treated as a passing mouse-exit check. Real-study map fullscreen passed.
- No uncaught JavaScript errors in the twelve study journeys. The optional
  `/data/manifest.json` and a Next navigation-prefetch text URL return 404 in
  both the changed build and the unchanged baseline. These are retained known
  local-preview warnings, not claimed to be fixed or a fully clean network run.

## Remaining scientific concerns

Official identification FAIL remains. These two reproduced failures are a
lower bound, not an exhaustive production-log diagnosis. Instrument spelling
and missing structured observation mode do not independently establish invalid
radar pixels or incorrect geolocation; acquisition-mode provenance and
radiometric/scientific clearance remain unresolved. No physical cause or
scientific confidence is inferred. Hubbard and Sossusvlei retain their existing
blocked decisions and all research evidence in their separate worktree.

## Recommended Git steps, only after approval

1. Review these 18 files against `0cf569d`; stage only the named paths on
   `feat/tango-qa-disclosures`, then commit the disclosure change.
2. Push that branch only after approval. Open a focused PR against the team's
   chosen six-study integration branch; do not duplicate the Dubai integration.
3. Preserve research separately: review and commit only the intended pipeline,
   tests, configurations and research reports on its branch. Its copied Dubai
   frontend changes must not be accidentally included as a second integration.
4. Reconcile approved commits through the normal PR process; do not reset,
   overwrite either dirty worktree, blanket-stage, force-push or deploy.
