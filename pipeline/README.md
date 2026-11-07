# SAR-Waltz offline NISAR pipeline

Search, inspect, then precompute NISAR **L-band frequency-A GCOV** products into fixed-scale PNG overlays, reduced-resolution float32 Cloud Optimized GeoTIFFs, and JSON for the static dashboard. Python runs only during preparation. The exported website reads files; it needs no Python service, database, Electron, or map package.

## Install

Use standard 64-bit CPython **3.14.7** (pinned in `.python-version`) or **3.13**. Run these commands from the repository root. Dependencies are pinned in `requirements.txt`; `--only-binary=:all:` prevents compilation or installation of a system GDAL. Rasterio's wheel supplies GDAL. On a platform without a matching wheel, installation fails clearly; use a supported current Windows, macOS, or Linux platform instead of building GDAL.

Windows PowerShell:

```powershell
py -3.14 -m venv pipeline/.venv
& pipeline/.venv/Scripts/python.exe -m pip install --only-binary=:all: -r pipeline/requirements.txt
& pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q
```

macOS / Linux:

```sh
python3.14 -m venv pipeline/.venv
pipeline/.venv/bin/python -m pip install --only-binary=:all: -r pipeline/requirements.txt
pipeline/.venv/bin/python -m pytest pipeline/tests -q
```

For 3.13, substitute `py -3.13` or `python3.13` when creating the environment. You can activate the environment (`pipeline/.venv/Scripts/Activate.ps1` on PowerShell, `source pipeline/.venv/bin/activate` on macOS/Linux) and use `python` in the commands below. Activation is optional; using the full interpreter path works without changing PowerShell execution policy.

Direct dependencies are the requested numpy, h5py, rasterio, pillow, matplotlib, asf_search, and pytest. Their required wheel dependencies include ASF's HTTP/date/geometry libraries, Rasterio's affine/CLI libraries, Matplotlib's color/font/numeric libraries, and Pytest's test infrastructure. No additional application dependency is introduced.

## Fetch → inspect → process → copy

1. **Choose geographic bounds.** In [ASF Vertex](https://search.asf.alaska.edu/), draw a small rectangle around a hotspot, filter to NISAR GCOV and L-band, and record WGS84 west,south,east,north. A search rectangle intersects products; it does not crop the download. Use `--aoi` during processing to crop. Start small: one GCOV file can be several gigabytes. Bounds cannot cross the antimeridian or exceed Web Mercator latitude limits; split those areas.

2. **Preview the catalog without credentials or downloads.** This example is a geographic search area, not a claim that any named event occurred there:

```sh
python -m pipeline.fetch_nisar --bbox=-80.8,25.5,-80.6,25.7 --start 2026-07-01 --end 2026-09-30 --max-results 10 --dry-run
```

The tool verifies `DATASET.NISAR`, `PRODUCT_TYPE.GCOV`, and `INSTRUMENT.L_SAR` in the installed `asf_search`, then prints dates, frame, track, pass, size, version/CRID, and maturity before downloads. Optional `--track 47 --frame 15` restricts a compatible time series; use identifiers from your search. Optional `--maturity PROVISIONAL` filters the catalog. A reached result cap is reported; increase it deliberately or narrow the query.

3. **Authenticate and fetch.** Create an [Earthdata Login](https://urs.earthdata.nasa.gov/). Configure an Earthdata `urs.earthdata.nasa.gov` login/password entry in `~/.netrc` (Windows `_netrc` also works), or supply an Earthdata bearer token through the `EARTHDATA_TOKEN` environment variable. `NETRC` can point to a chosen file. Authentication values and signed URLs are neither logged nor written to outputs. Remove `--dry-run` and add `--out pipeline/downloads`:

```sh
python -m pipeline.fetch_nisar --bbox=-80.8,25.5,-80.6,25.7 --start 2026-07-01 --end 2026-09-30 --track 47 --frame 15 --maturity PROVISIONAL --max-results 10 --out pipeline/downloads
```

Files download into staging directories and are checked for HDF5 signature and catalog byte size before publication. Existing validated files are skipped. Existing incomplete/mismatched files are preserved and reported for you to move aside. Successful files have a `.h5.asf.json` sidecar containing safe catalog metadata, including calibration maturity; keep it with the HDF5 file.

4. **Inspect each product layout before processing.** Supply the actual filename returned by ASF:

```sh
python -m pipeline.inspect_h5 pipeline/downloads/YOUR_GCOV_PRODUCT.h5
```

The full hierarchy includes dataset shapes, dtypes, chunks, compression, and attributes. Large attribute values are summarized. Soft/external links are described without opening them. No raster or scalar dataset values are read by this tool. Compare the discovered hierarchy and metadata with the [GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/) and [official GCOV product XML](https://github.com/isce-framework/isce3/blob/develop/python/packages/nisar/products/XML/L2/nisar_L2_GCOV.xml). The processor validates the expected paths every time and lists the discovered layout when they differ. The inspect step is a deliberate human review; the CLI does not infer approval from a prior run.

5. **Validate the processing plan without reading science rasters or writing outputs**, then process:

```sh
python -m pipeline.nisar_to_overlays --input pipeline/downloads --out pipeline/output --aoi=-80.8,25.5,-80.6,25.7 --max-size 1024 --dry-run
python -m pipeline.nisar_to_overlays --input pipeline/downloads --out pipeline/output --aoi=-80.8,25.5,-80.6,25.7 --max-size 1024 --png-quantize
```

Defaults are `--pols HHHH,HVHV`, `--max-size 2048`, `--db-range HH=-25,0`, and `--db-range HV=-30,-5`. Repeat `--db-range` to override both polarizations. A file without a requested polarization fails with a clear error; use `--pols HHHH` for an HH-only series. Off-diagonal complex covariance is outside this pass. AOI cropping snaps outward to source pixels before any power read; its actual bounds are recorded.

6. **Copy the complete output into `frontend/public/data/`**, preserving frame subfolders and the manifest. PowerShell:

```powershell
New-Item -ItemType Directory -Force frontend/public/data | Out-Null
Copy-Item -Path pipeline/output/* -Destination frontend/public/data -Recurse -Force
```

macOS/Linux:

```sh
mkdir -p frontend/public/data
cp -R pipeline/output/. frontend/public/data/
```

Alternatively, process directly with `--out frontend/public/data`. Review the generated files and include the desired `public/data` artifacts in version control. The processor stages a complete run and publishes its manifest last. Files from previous runs are not deleted automatically; use a fresh output folder when reducing the dataset. Rebuild the static frontend to include new data in its exported `out/data/` folder. The dashboard loads `/data/manifest.json`, adds a distinct **Processed GCOV** category, and displays **DERIVED** badges, actual rasters, histograms, source details, and fixed-scale change layers. Missing manifests keep sample mode; invalid manifests produce a visible warning. No simulated earthquake or land-loss measurement is inferred from GCOV.

## Processing and output contract

- Source paths: `/science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,xCoordinates,yCoordinates,xCoordinateSpacing,yCoordinateSpacing,projection,mask}`. Identification: `/science/LSAR/identification/{zeroDopplerStartTime,zeroDopplerEndTime,absoluteOrbitNumber,trackNumber,frameNumber,orbitPassDirection,productVersion,compositeReleaseId}`. Coordinate vectors represent pixel centers. A regular north-up grid and valid EPSG are required.
- GCOV is gamma-0 **linear power**. Source reads are bounded to 512×512 windows. Nonpositive/nonfinite power, mask 0 (ensemble includes partially focused/invalid samples), and mask 255 (outside acquisition) are excluded. Valid power is averaged before `10*log10`. Mask numbers 1–254 are subswath identifiers, not boolean flags. Optional newer quality layers such as `inputDataExceptionMask` are not interpreted in this version; review those when judging science quality.
- Multilooking caps the analysis raster at `max-size` on its longest dimension. Balanced integer bins include edge pixels; non-divisible bin widths differ by at most one source pixel and are mapped to a regular output grid preserving the crop extent. These outputs are visualization/overview analysis products, not full-resolution science exports. Histograms and means describe the **reduced dB raster**.
- COGs retain unclipped float32 dB in the native source CRS with DEFLATE, tiled layout, nodata **-9999**, and nearest-neighbor overviews. PNGs are reprojected to EPSG:3857 using a shared grid for every acquisition in a frame; transparent pixels are nodata. Manifest bounds are the PNG rectangle expressed as `[west,south,east,north]` in EPSG:4326. `overlayTransform`, `overlaySize`, `analysisBounds`, and `analysisTransform` record exact grids.
- Backscatter PNGs use Matplotlib **gray** with fixed ranges HH [-25,0], HV [-30,-5] dB. Change PNGs use **RdBu_r**, fixed [-6,6] dB, centered on zero (blue decrease, red increase). Display clipping does not alter COG values. No per-image percentile stretching occurs.
- Consecutive acquisitions are grouped by track, frame, and pass, sorted by UTC time, and differenced only on identical source grids. Multiple frames are isolated; duplicate same-day acquisitions fail rather than overwrite each other. Different `productVersion`, `compositeReleaseId`, or known/unknown calibration maturity refuse comparison unless `--allow-mixed-versions` is explicitly passed. Affected frames/pairs are then flagged. Calibration maturity comes from an HDF5 field if present or the ASF sidecar; absent maturity remains `UNKNOWN`, with a note, rather than being guessed from processing type.
- `dbDiff` is later minus earlier for each polarization. `hvhhDiff` is **HV minus HH at the later acquisition**, a cross-polarization log ratio, not a temporal difference. This interpretation is recorded explicitly. Earthquake line-of-sight displacement and interferograms need **GUNW** products and separate phase processing; they are out of scope.
- Histograms have 64 fixed-range bins, 65 edges, integer `counts`, and `normalized` fractions relative to all valid reduced pixels. Out-of-range values are not folded into edge bins: `underflow` and `overflow` are reported. Consequently normalized fractions can sum below 1. `statisticsDb` contains actual valid reduced-raster mean/min/max and valid-pixel count; all-nodata means/min/max are JSON `null`.
- Gaps longer than 12 days are recorded from exact UTC intervals. Download credentials and absolute source paths never enter the manifest. URLs are relative to its directory. JSON serialization rejects NaN/Infinity.

Output names:

```text
manifest.json
T047_F015_A/
  20260909_HH.png / .tif
  20260909_HV.png / .tif
  change_20260909_20260921.png / .tif       # first requested polarization
  change_20260909_20260921_HV.png / .tif   # second polarization
  change_20260909_20260921_HVHH.png / .tif # later-acquisition HV−HH
```

Dates above illustrate naming only. The manifest also carries `generated`, `provenance: "derived"`, `source`, frame identity/bounds, acquisition dates/orbits/versions/polarizations/PNG/COG/histogram/statistic maps, change-layer pair/type/polarization/mixed-version flags, gaps, display ranges, color maps, and processing notes. Sample dashboard JSON remains separate and pure data.

The CLI reports output size and warns above 50 MB (50,000,000 bytes). Reduce `--max-size`, crop with `--aoi`, select fewer products, or enable `--png-quantize` (RGBA palette conversion with transparent nodata). Quantization affects only display PNGs. Float rasters stay unquantized. Larger `max-size` values (up to 8192) require proportionately more output memory; default 2048 is bounded to overview grids while the original raster is always streamed.

## Validation and limits

Tests use explicitly synthetic HDF5 fixtures and temporary outputs, never fabricated NASA observations committed to the dashboard. They cover arithmetic/masks, windowed reads, fixed scales, transparency, histograms, COG layout/nodata/CRS, projected bounds, timeline gaps, ratios/difference sign, AOI cropping, release/maturity checks, and malformed layouts. Fetch tests use local fakes for authentication/download behavior. A separate public ASF dry-run verifies live catalog integration without credentials. An authenticated multi-gigabyte product download and science validation remain dependent on your Earthdata access and selected products.

See [verification results](docs/verification.md) for the Python 3.13/3.14 tests and the running dashboard integration checks.

Primary references: [ASF search manual](https://docs.asf.alaska.edu/asf_search/searching/), [NISAR ASF search guide](https://nisar-docs.asf.alaska.edu/asf-search/), [GCOV guide and product specification](https://nisar-docs.asf.alaska.edu/gcov/), [official GCOV XML](https://github.com/isce-framework/isce3/blob/develop/python/packages/nisar/products/XML/L2/nisar_L2_GCOV.xml), [PROVISIONAL known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/), [Rasterio installation](https://rasterio.readthedocs.io/en/stable/installation.html).
