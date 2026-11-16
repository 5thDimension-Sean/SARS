# SARS
This is SARS for NASA Space Apps plz no copy

copy = bad boy


The SAR-Waltz dashboard frontend is in `frontend/`. See [frontend setup and sample-data notes](frontend/README.md). The Python data pipeline is deferred until frontend approval.

## What is live

- Real NASA NISAR L2 GCOV before/after comparisons, processed offline, for Everglades, Louisiana, Big Sur, Rodanthe, Amazon (Mamirauá), Etna, Hubbard Glacier, Sossusvlei and the Padma River. Each shows HH/HV imagery, histograms, A/B/C regions and an evidence checklist. All are exploratory and not QA-cleared.
- A trust check (`/trust`) runs on the published numerical grids. It and `/coordinates` stay reachable by direct link but are not in the navigation.
- Live processing for any coordinate needs a separately hosted Python worker (`pipeline/PRIVATE_PROCESSING.md`). None is running, so `/coordinates` lists the published places instead of a form.
