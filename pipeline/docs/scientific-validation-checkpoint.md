# Frequency A scientific validation checkpoint

The updated inspector collects evidence; it does not approve quantitative change analysis. No temporal backscatter differences or environmental interpretations are produced. Work remains on redesign-v2, with frontend code, main and backup folders preserved.

## Strict metadata comparisons

NISAR identification timestamps lacking a timezone suffix are interpreted as UTC for this documented field only. Comparison uses exact integer nanoseconds, not floating seconds or Python datetime's microsecond truncation. A one-nanosecond mismatch still fails. No timing tolerance was added. Orbit direction is normalized by case, then restricted to ASCENDING or DESCENDING; unknown values and true direction differences still fail.

An [offline evidence review](../reports/everglades-science-offline-review-20261107.json) reevaluates the previous report's saved identity metadata with the corrected checks: 30 PASS, 0 FAIL, 14 UNVERIFIED across that limited set of checks. It explicitly records **no new scientific reads**. It is not a substitute for the next authenticated quality run and does not reuse previous pixel counts as newly quality-screened counts.

## New evidence collected by the authenticated run

- Actual scalar values from inventoried RTC, RFI, noise and masking metadata, not just dataset names and attributes. Nonfinite scalars are recorded as null with an explicit nonfinite flag.
- Frequency A gamma0 evidence requires L-band GCOV identity, HHHH/HVHV units `1`, output normalization `gamma0`, and output expression `linear power`. A different convention fails; missing metadata stays UNVERIFIED. This verifies the declared calibrated product convention, not residual calibration accuracy.
- Native-grid quality arrays are read only when shape and attached x/y coordinate scales match their frequency grid. Unknown or mismatched grids are not resized or applied. This preserves the unresolved Frequency B exception-mask shape discrepancy.
- The subswath mask must have confirmed native dimension scales and explicit 0/255 semantics before applying it. Common screened counts are withheld if this cannot be established.
- An input exception mask is applied only if it is an integer layer on the confirmed native grid and its description establishes bitwise codes with zero meaning no anomaly. Every nonzero exception code is conservatively excluded, including unknown bits. The report records code counts and whether each mask was applied.
- Disjoint exclusion counts use this precedence: nonfinite power, declared fill, nonpositive power, mask 0, mask 255, input exception. Counts therefore sum to the ROI total, including retained pixels, without double-counting. This precedence is bookkeeping, not a ranking of scientific causes.
- Number-of-looks and RTC-factor layers receive finite/nonfinite/nonpositive counts and ranges when their native grid is confirmed. No arbitrary quality threshold is invented. Other non-grid arrays are inventoried as unread, explicitly requiring separate interpretation.
- Common counts are intersections of each date's screened native pixels, separately for each polarization and frequency. They are provisional until full QA and manual review; they are never labeled final scientifically valid counts.
- Row/column median profiles of individual acquisitions' linear power support review of banding and seams. They are not temporal comparisons or artifact detectors. Geography can produce similar profiles. They cannot establish absence of swath-wide artifacts or noise-floor bias.
- The catalog-linked official QA summary CSV is read, hashed and retained as structured rows. Retrieval PASS does not imply the QA results passed: all rows, including any reported FAIL, remain visible for review. The official PDF and QA_STATS HDF5 are not automatically fetched; unresolved QA findings may require them in a later bounded inspection.

## Scientific sources and review

The [ASF GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/) describes calibrated gamma0 power, covariance terms, number of looks, masks and RTC normalization. The [NISAR product-format document](https://bhoonidhi.nrsc.gov.in/NISAR/NISAR_Data_Product_Format_Document_V1.2.1_digisigned.pdf) documents UTC acquisition times and orbit-direction terminology. The actual product specification version is retained in the evidence.

[ASF provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/) identifies joint-mode 40 MHz radiometric bands, residual RFI/filter effects, low-level ripples, and greater calibration residuals in Frequency B. These are applicable risks, not observations established for this ROI. Review actual QA, RFI values and per-date profiles before judging whether this Frequency A pair is suitable. A quantitative noise-floor assessment requires suitable calibrated noise information; it remains UNVERIFIED until that evidence is available.

Every check has a `scope`: automated or manual. Calibration interpretation, full official-QA interpretation, artifact review and overall suitability remain manual UNVERIFIED checks. They cannot silently pass through the automated reader. Missing metadata, budget exhaustion or ambiguous coordinate mappings must remain visible.

## Limits and provenance

The original HTTPS allowlist, redirect restrictions and credential isolation remain unchanged. The primary HDF5 reader retains its 64 MiB cap and 8 MiB memory cache. The small QA CSV is requested only after the primary reader closes, using the **remaining portion of the same 64 MiB per-product allowance**. QA size is capped at 256 KiB. `totalProductBodyBytes` includes primary HDF5 and QA body consumption; each has a separate audit. Authentication exchanges and HTTP/TLS overhead are outside these body counters. There is no full-product fallback or persistent science cache.

The JSON report retains source catalog metadata, exact acquisition identifiers, processing versions, code hashes, runtime versions, grid/ROI geometry, source references and limitations. Earlier reports are never overwritten. Current authentication is still available only in the user's PowerShell terminal; no newly authenticated QC result is claimed in this update.

## Authenticated command

Run in the same PowerShell terminal containing EARTHDATA_TOKEN:

```powershell
Set-Location C:\Users\Roger\SARS
if ((git branch --show-current) -ne 'redesign-v2') { throw 'Expected redesign-v2.' }
if ([string]::IsNullOrWhiteSpace($env:EARTHDATA_TOKEN)) { throw 'EARTHDATA_TOKEN is unavailable.' }
$nisarStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
.\pipeline\.venv\Scripts\python.exe -m pipeline.check_compatibility --require-auth --output "pipeline/reports/everglades-science-validation-$nisarStamp.json"
```

Return only the resulting report filename for review. The expected overall verdict remains NOT CLEARED until the evidence is reviewed. Do not start temporal analysis merely because automated checks pass.

## Regression verification

134 Python tests passed. Tests cover nanosecond timing mismatches, orbit-direction mismatches, incorrect power conventions, missing calibration evidence, quality-grid mismatches, unconfirmed mask semantics, disjoint exclusions, common-support intersections and QA transfer budgets. The unchanged restored processor still emits 60 Affine deprecation warnings. The frontend source digest remains `fdce28a57279a73f144e2c46cb37491254753001100402fead908c43e3091949`; main and redesign-v2 branch pointers remain unchanged.
