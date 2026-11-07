# NISAR redirect access checkpoint

Safe redirect support is implemented on redesign-v2. Authenticated HDF5 validation is still pending a run in the user's PowerShell process. This agent cannot inherit EARTHDATA_TOKEN from that already-running terminal. No numerical environmental change was calculated. No frontend source, main branch, or backup folders were changed.

## Evidence and limits

The prior authenticated report recorded HTTP 303 for both primary HDF5 products but did not record Location hostnames. Its precise authenticated destinations therefore remain unknown.

A separate HTTPS probe of the official NASA public browse URL for G4342506513-ASF observed a 303 redirect to **d1mv8zhcvry6x4.cloudfront.net**. The CDN path retained the expected catalog product key after an `s3-` mapped-origin prefix. A request for bytes 0-15 returned **HTTP 206** with **Content-Range: bytes 0-15/3023534**. No browse response-body bytes were consumed. These observations establish the public browse delivery endpoint and its range response, not authenticated HDF5 streaming or scientific validity.

This behavior is consistent with ASF's [Thin Egress App architecture](https://tea-docs.asf.alaska.edu/technical/), which uses signed download URLs and CloudFront. The exact hostname was verified from NASA's HTTPS response, not guessed from a wildcard domain. No complete signed URLs, cookies, authorization headers, or query values were persisted.

The new [agent-run report](../reports/everglades-redirect-fix-agent-20261106.json) has **12 PASS, 0 FAIL, 12 UNVERIFIED** checks. This run had no credentials: both primary URLs returned HTTP 302 to `urs.earthdata.nasa.gov`. The reader rejected that login redirect without following it. Each product has zero consumed HDF5 bytes and zero verified 206 responses. The 12 PASS results describe catalog dates, ROI polygons, and matching catalog properties only.

| Check | Status | Evidence |
| --- | --- | --- |
| Public browse destination identified | PASS | Exact CDN host verified from official NASA response |
| Public browse range headers | PASS | HTTP 206, exact Content-Range for bytes 0-15 |
| Authenticated HDF5 redirect destination | UNVERIFIED | Prior report omitted hostname; agent lacks token |
| HDF5 HTTP 206 and Content-Range | UNVERIFIED | Must be confirmed separately for each product |
| Actual datasets, units and processing identity | UNVERIFIED | No authenticated HDF5 body consumed |
| Native CRS, spacing, grids and ROI coverage | UNVERIFIED | Catalog footprint is insufficient |
| Validity masks and common screened pixels | UNVERIFIED | No numerical ROI reads completed |
| Radiometric artifacts and suitability | UNVERIFIED | Requires actual data and QA review |

## Implementation

- `pipeline/sources.py`: only the canonical NASA host receives the original Earthdata session credentials. Redirect destinations must use HTTPS, the exact allowlisted CDN hostname, port 443/default, and the unchanged product key after the mapped-origin prefix. Userinfo, fragments, invalid paths and control characters are rejected. Unknown destinations stop for review; there is no automatic allowlisting.
- Redirected requests use bare prepared requests with Range headers and no inherited Earthdata bearer token, cookies, session authentication, environment netrc, or proxy credentials. Signed URLs stay in memory only and are cleared when the reader closes. TLS certificate verification stays enabled.
- Redirects are followed manually with a maximum of three followed hops per request. A dedicated Requests session prevents Requests from pre-reading redirect bodies when preparing Response.next. All redirects and authentication errors close without consuming bodies.
- Every data response must be HTTP 206 with exact range bounds and total product size, identity encoding and a non-HTML content type. HTTP 200 is rejected before body reads. Strong ETags are reused via If-Match when available.
- Maximum response-body consumption remains **64 MiB per product**, and the LRU memory cache remains **8 MiB**. No disk science cache or full-file download fallback exists. Counts exclude HTTP/TLS overhead and authentication exchanges.
- `pipeline/check_compatibility.py`: adds `--require-auth`, reports safe redirect hostnames, range response counts, first/last Content-Range, safe transport errors, inspection stage and metadata/ROI transfer split. No signed URLs are included. urllib3 URL debug logging is disabled by the CLI.
- `pipeline/tests/test_sources.py`: tests allowed and rejected redirects, exact product paths, HTTPS/host checks, stripped credentials/cookies, hidden redirect-body consumption, missing ranges, invalid ranges, authentication failure, redirect limits, byte budgets and required-auth early stop.

## Run locally

Use the same PowerShell terminal containing EARTHDATA_TOKEN. No new credential entry is required:

```powershell
Set-Location C:\Users\Roger\SARS
if ((git branch --show-current) -ne 'redesign-v2') { throw 'Expected redesign-v2; no branch was changed.' }
if ([string]::IsNullOrWhiteSpace($env:EARTHDATA_TOKEN)) { throw 'EARTHDATA_TOKEN is not available in this terminal.' }
$nisarStamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
.\pipeline\.venv\Scripts\python.exe -m pipeline.check_compatibility --require-auth --output "pipeline/reports/everglades-redirect-authenticated-$nisarStamp.json"
```

Share only the resulting report filename. The command verifies authentication before product requests, starts with metadata and then reads the configured small ROI. Existing reports are never overwritten. If a new data hostname is rejected, review its recorded hostname and verify it through NASA/ASF before expanding the allowlist. Do not replace the allowlist with a generic cloudfront.net or amazonaws.com rule.

## Remaining scientific review

After successful HDF5 access, review actual HHHH/HVHV datasets, unit attributes, native coordinates/CRS, grid alignment, mask codes and common finite-positive screened pixels. The screen excludes declared fill and mask 0/255; these counts are not complete quality certification. Review official QA and acquisition-specific artifacts before clearance. No temporal differences are produced by this checkpoint.

ASF's [provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/) documents joint-mode 40 MHz radiometric banding, residual RFI/filter effects, possible low-level ripples, and larger systematic calibration residuals in frequency B. These are relevant review considerations, not observed findings for this ROI. Do not treat frequency B as equivalent in radiometric quality to frequency A. No phase correction is needed for the diagonal HHHH/HVHV terms under the documented polarimetric phase issue.

The verdict remains NOT CLEARED pending this evidence and explicit scientific review; automated transport success does not provide scientific clearance.

## Validation

All 102 Python tests passed, including 37 access/inspection tests. The 60 Affine deprecation warnings come from the unchanged restored processor. The 7 frontend regression tests, lint and production build passed. The frontend source digest remains `fdce28a57279a73f144e2c46cb37491254753001100402fead908c43e3091949`, identical to the pre-checkpoint digest. No browser behavior or scientific scene validity is inferred from these software tests.
