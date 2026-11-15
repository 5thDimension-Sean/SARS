# Public per-user-token demo, without a hosting bill

Each visitor opens the coordinates page, enters coordinates and their own NASA
Earthdata token, and requests a real NISAR comparison. The application uses that
visitor's token only for their job. No shared NASA credential is configured.
Results show source dates/granules, HH/HV measurements, histograms, regions and
quality limitations, or an honest no-compatible-data/error state.

This temporary demo runs the existing worker on the owner's computer. A
Cloudflare Quick Tunnel publishes only this application's loopback port over
HTTPS, including the reviewed static export. It does not expose the filesystem,
SSH, other ports or original HDF5 downloads. Private API results still require
their separate job token. No local Docker installation or Cloudflare account is
needed. Anyone with the demo URL can submit a job; keep the existing global
limit of one active job and six accepted jobs per hour.

## Setup

Use Node.js 22.13+ and Python 3.13. In a dedicated Python virtual environment,
install `pipeline/private-api-requirements.txt`. Run `npm ci` in `frontend/`.
Install `cloudflared` from Cloudflare's official download or package registry.

Point `TANGO_PYTHON` at that virtual environment's Python and
`TANGO_CLOUDFLARED` at the connector executable if they are not on PATH. These
are executable paths, not secrets. Then run from the repository root:

```text
node pipeline/deployment/start-free-demo.mjs
```

The runner starts a temporary HTTPS tunnel, rebuilds the static frontend for
that exact origin, starts one loopback-only worker, and verifies public health
before printing a shareable `/coordinates` link. It uses a dedicated temporary
job directory outside the static export. No Earthdata token belongs in the
runner, environment files, source files or startup commands. Each visitor
submits their own token through the HTTPS form.

Keep at least 30 GB free disk and sufficient available memory for the worker;
measure real peak usage before opening capacity to more visitors. Catalog
products may total 6 GB, but coordinate jobs read only needed source blocks,
with a 128 MiB transfer cap per source. Raw blocks are discarded after processing;
derived results expire after 45 minutes. Stopping terminates processing
descendants too. Normal worker shutdown runs cleanup; after a forced stop or
crash, the next startup removes abandoned recognized job directories.

## Availability and verification

The laptop must remain awake and connected. Stopping the runner ends the link;
restarting creates a new hostname. Cloudflare Quick Tunnels have no uptime
guarantee, are for testing/development, and cap in-flight requests at 200.
They are not permanent hosting. Do not save the temporary URL in production
Vercel settings; use the printed demo link separately.

Healthy startup is not an end-to-end scientific acceptance result. Before
claiming successful generation, complete a real authenticated job in the demo
page and inspect the images, count accounting, source metadata, quality checks
and denied access without the private job token. Missing coverage must remain
unavailable, not be replaced with synthetic measurements.

Sources: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
