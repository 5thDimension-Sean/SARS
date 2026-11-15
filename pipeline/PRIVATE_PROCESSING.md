# Private coordinate-to-NISAR worker

## Deployment status and acceptance gate

The worker is implemented but no permanent public backend URL has been provisioned
by this change. A temporary free demo is documented in `deployment/FREE_DEMO.md`.
A passing offline test uses explicitly synthetic test fixtures;
it does not demonstrate a real NASA authenticated download. Keep the production
submit button disabled until a reviewed HTTPS worker is running and the
real-data check below passes. Do not set a placeholder API URL in Vercel.

The coordinate shortcuts include **Padma River, Bangladesh (23.75, 90.05)**.
Its existing `/padma-erosion` investigation uses historical Landsat imagery;
that does not establish NISAR coverage. The worker must discover a genuine
compatible NISAR pair at that point before showing any HH/HV results.

## Resource and failure bounds

Coordinate jobs now use bounded HTTP byte-range access to read HDF5 metadata
and only the HH/HV/mask chunks needed for the small requested area. They do not
download complete multi-gigabyte scenes. Existing grid, metadata, masking and
paired-difference checks are unchanged. Each source is limited to 128 MiB
transferred with a 32 MiB in-memory LRU cache; both sources share a three-minute
read deadline. Servers ignoring Range are rejected before consuming their
whole response. Strong ETag/If-Match and exact Content-Range checks reject
changing or mismatched source objects. Credentials are stripped from signed
CDN/S3 requests, as on the full-download path.

Range receipts report catalog source size, actual bytes transferred, and
SHA-256 hashes of the listed retrieved ranges. These are explicitly not
whole-file source hashes. The older offline full-download helper remains
available separately. No persistent source cache or shared credential is added.

The coordinate page retains its separate private job session in JavaScript
memory across internal navigation. Returning in the same tab reopens the same
job/result instead of requiring another source read. Reloading closes that
memory session; NASA tokens are never retained for resubmission.

- Single concurrent job; six accepted jobs per hour across the whole worker.
- At most 100 catalog results, 3 GB per source and 6 GB of source downloads.
- A 1 KiB request-body limit counts streamed bodies as well as Content-Length.
- The offline full-download helper has 15-second connect / 60-second idle timeouts, a
  15-minute aggregate download deadline, and catalog byte limits enforced while
  streaming. NASA credentials are never sent to signed S3 redirect hosts.
- Catalog search, download and HDF5 processing run in a separate process with
  a hard 20-minute job deadline. Shutdown/timeout kills that process and removes
  raw and incomplete derived data. This does not depend on a cooperative thread.
- Finished jobs expire 45 minutes after submission; a background reaper runs
  every 30 seconds even when nobody makes another API request.
- Results include source filenames, byte counts and explicitly scoped SHA-256 hashes, dates,
  product/specification versions, native analysis-grid CRS and QA limitations.
- Native HDF5 track/frame/pass/release/maturity/version and requested geographic
  coverage are checked against catalog selection. Unknown catalog metadata is
  never treated as matching by converting it to the string `None`.

## Run without local Docker

No local Docker installation is required. Use a Linux host with Python 3.13,
at least 2 vCPU / 8 GB RAM and 30 GB free private disk as an initial demo
allocation; measure real job peak memory/disk before admitting more traffic.
A persistent VM has predictable storage and process lifetime, but incurs cost
while running and needs patching. Short-lived/serverless functions have less
idle cost but do not meet these disk/runtime assumptions. Do not provision
paid infrastructure without the owner's hosting choice and spending limit.

The reviewed checkout belongs at `/opt/tango`. Create `/opt/tango/.venv`,
install `pipeline/private-api-requirements.txt`, and use the supplied
`deployment/tango-processing.service` for process and resource limits.
Supply `/etc/tango-processing.env` with the exact deployed frontend origin:

```text
PROCESSING_ALLOWED_ORIGINS=https://sars-d9rv0zhx6-seanzhangeng-6080.vercel.app
```

The service binds only to 127.0.0.1:8090. Point a backend domain at the host
and serve it with the supplied `deployment/Caddyfile`, setting
`PROCESSING_DOMAIN` in Caddy's environment. Only HTTPS should be publicly
reachable. Do not expose 8090, the private job directory or raw HDF5 files.
Validate the Caddy and systemd configuration on the chosen host before
enabling them. Never enable request/header/body debug logging at the proxy.

After `/v1/health` is healthy, configure Vercel's build-time
`NEXT_PUBLIC_PROCESSING_API_URL` to that actual HTTPS backend, rebuild, and
verify the resulting deployment's exact origin still matches the allowlist.
If Vercel creates a new preview origin, update the allowlist before testing.

## Real-data acceptance check

Set `PROCESSING_API_URL`, `FRONTEND_ORIGIN` and your authorized
`EARTHDATA_TOKEN` locally without recording them in shell history or files.
Run:

```sh
python -m pipeline.verify_coordinate_backend
```

The check submits Everglades coordinates, waits for the actual worker,
validates two ordered genuine-source acquisitions, histogram count accounting,
three regions, protected PNGs and denial of unauthenticated results. It prints
only source hashes/provenance and the result status, never tokens or job access
URLs. It fails rather than claiming success when data, authentication, processing
or access controls are unavailable. Then browser-test coordinates, HH/HV,
swipe/side/difference modes, progress, errors and expiry on desktop and mobile.

The host/account/domain and an authorized real-data test are still required
before claiming a functioning deployed backend. Do not paste tokens into chat.

The TANGO site is statically exported and **cannot** run scientific HDF5
processing. This directory contains a separate, disk-backed API that Sean (or
the infrastructure owner) must deploy before live custom coordinates work.

## How it works

1. The static `/coordinates` UI offers **exactly ten starting coordinates**.
   Selecting one fills latitude/longitude; users can edit both. No date or
   upload controls are present.
2. The user supplies **their own NASA Earthdata bearer token**. The browser
   submits it in `X-Earthdata-Token` over **HTTPS** directly to this worker.
   The token is **never stored in localStorage, cookies, source control,
   result URLs, files, reports, or application logs**.
3. ASF catalog search (last 180 days) automatically selects two metadata-
   compatible NISAR GCOV acquisitions for the chosen geographic point (same
   track/frame/pass/release/version). There is **no user date selection**.
   Selection is based on date separation, not on environmental causation.
4. The service holds the token **only in worker memory during processing**.
   It reads the required HDF5 byte ranges, screens the GCOV grids, produces aligned HH/HV
   change rasters, and reuses the *Everglades evidence generator* for histograms,
   region statistics, preview PNGs, and QA records.
5. It **discards raw source blocks from memory** after processing. It returns
   only derived evidence and private PNG previews via a separate unguessable
   short-lived job access token. Results are exploratory, not scientifically
   cleared, and jobs are deleted when expired and checked during subsequent API
   requests (45-minute TTL).

## Deployment prerequisites

This is **not compatible with GitHub Pages or Vercel serverless functions**;
raw scenes can be multi-gigabyte and processing may take many minutes.
Deploy a **single** Python worker on persistent compute with a dedicated
ephemeral volume (at least 12 GiB free), HTTPS proxy, strict CPU/memory limits,
and egress to NASA ASF/Earthdata. Configure a hard cap on concurrent jobs.
Only deploy reviewed code; monitor costs and disk.

```sh
python -m pip install -r pipeline/private-api-requirements.txt
export PROCESSING_WORKDIR=/srv/tango-private-jobs
export PROCESSING_ALLOWED_ORIGINS=https://tangosars.vercel.app
uvicorn pipeline.private_processing_api:app --host 127.0.0.1 --port 8090 --workers 1 --no-access-log
```

Provision TLS at the reverse proxy, set `Cache-Control: no-store`, disable
request/header/body logging and error-report payload capture, and never export
the work directory as a public static directory. Do not put Earthdata keys in
error traces. Do not use multiple worker processes; session and job indexes
are deliberately in-memory. For production availability, replace the in-memory
queue with an authenticated, encrypted and explicitly short-lived job system
before adding multiple workers.

In the frontend Vercel build settings set:

```
NEXT_PUBLIC_PROCESSING_API_URL=https://your-https-worker-domain
```

Rebuild the static frontend after setting this value. **Do not set it to an
untrusted URL or an insecure HTTP host.** Until this is configured, the UI
leaves the submit button disabled rather than pretending to generate data.
Production can be launched only by a person authorized to manage this
separate backend and Sean's Vercel project.

## Scientific limits

Only real NASA NISAR L2 GCOV products in the selected catalog period are
used. Some points have no compatible scenes or insufficient worker resources:
the tool reports that honestly. The chosen longest compatible interval is
*not* necessarily the best physical-change observation. The derived radar
comparison does **not** establish flooding, erosion, damage or deforestation.
QA, radiometric artifacts, RFI, incidence geometry, water-level, tide,
phenology, and independent source validation must be reviewed before making
causal claims.

## Security limitations

The API provides memory-only per-job Earthdata credential handling, HTTP
origin allowlisting, an unguessable separate bearer token for each job, a
single concurrent worker, catalog result and byte limits, expiring jobs, and
whitelisted result images. It does **not** offer a full multi-tenant production
security system: add IP-based rate limits, identity/abuse controls, encryption
at rest for temporary worker disks and monitored resource quotas at the TLS
proxy before exposing it publicly. Origin checks alone are not authentication.
The user's token must have Earthdata access; do not ask users to paste tokens
in ChatGPT or share them with other users.

