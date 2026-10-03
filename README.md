# SARS
This is SARS for NASA Space Apps plz no copy

The SAR-Waltz dashboard frontend is in `frontend/`. See [frontend setup and data notes](frontend/README.md).

The offline Python GCOV pipeline is in `pipeline/`. See [installation and fetch → inspect → process workflow](pipeline/README.md). It generates static PNG overlays, float32 COGs, and a manifest for `frontend/public/data/`; the dashboard loads those as a distinct derived-data category while retaining the clearly labeled sample scenarios.
