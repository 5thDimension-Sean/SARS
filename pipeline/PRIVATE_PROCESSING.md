# Private coordinate-to-NISAR worker

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
   It downloads both HDF5 files, screens the GCOV grids, produces aligned HH/HV
   change rasters, and reuses the *Everglades evidence generator* for histograms,
   region statistics, preview PNGs, and QA records.
5. It **deletes raw HDF5 downloads** immediately after processing. It returns
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
