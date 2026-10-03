# ASF fetch and HDF5 inspection verification

Validation ran with Python 3.14 and the pinned `asf_search==14.0.3` installation.
The installed package was inspected directly before choosing its search constants:

| Installed constant | Verified value |
| --- | --- |
| `DATASET.NISAR` | `NISAR` |
| `PRODUCT_TYPE.GCOV` | `GCOV` |
| `INSTRUMENT.L_SAR` | `L-SAR` |
| `MATURITIES` values | `BETA`, `PROVISIONAL`, `VALIDATED` |

`fetch_nisar.py` checks the dataset, product, and instrument constants at runtime
and gives an actionable error if the installed package is incompatible. NISAR
search translation in 14.0.3 maps `relativeOrbit` to `TRACK_NUMBER` and `frame` to
`FRAME_NUMBER`. NISAR catalog sizes are per-file dictionaries rather than the
single numeric byte count used by some older ASF products.

## Live public catalog check

This bounded search succeeded without Earthdata authentication or downloading
any products:

```text
python -m pipeline.fetch_nisar --bbox=-80.8,25.5,-80.6,25.7 --start 2026-07-01 --end 2026-09-30 --max-results 2 --dry-run
```

The catalog returned two PROVISIONAL L-band GCOV products acquired on
2026-09-21, both ascending track 47, with frames 14 and 15. Their reported sizes
were 1228.0 MiB and 5476.0 MiB, and both reported composite release ID `P05023`.
The result cap was reached; this was a connectivity/integration check, not a
complete inventory. No credentials were inspected for this dry run. No products
or output directories were created.

## Download and metadata guarantees

- Token authentication takes priority over an Earthdata `urs.earthdata.nasa.gov`
  entry in `~/.netrc`; Windows `_netrc` and an explicit `NETRC` path also work.
- Downloads go into a temporary directory, then receive exact catalog-size
  checks when available and an HDF5 signature/header check before publication.
- Existing valid HDF5 files are skipped without authentication. Existing files
  that fail validation are preserved and reported for manual review.
- A safe `<filename>.asf.json` sidecar records catalog maturity, CRID, any exposed
  product/PGE version, collection name, granule identifier, and actual file size.
  Unavailable fields stay null. Maturity is never inferred from processing type.
- URLs, tokens, passwords, and session state are excluded from sidecars and CLI
  errors. This matters because signed download URLs may contain credentials.
- Actual authenticated Earthdata downloads were exercised through offline mocks,
  not against a user account. Successful public search does not verify account
  access or real product payloads.

`inspect_h5.py` prints all groups, dataset shapes/dtypes, chunk/compression
metadata, and attributes. It does not read dataset values, including scalar
identification datasets. Large attribute arrays are described without loading
their contents. Hard-link cycles are handled, and soft/external links are
described without following them. Offline tests replace dataset read methods
with failures, proving the inspection path performs no raster reads.

## Primary references

- [ASF search parameters](https://docs.asf.alaska.edu/asf_search/searching/)
- [NISAR search with ASF](https://nisar-docs.asf.alaska.edu/asf-search/)
- [ASF authentication and downloads](https://docs.asf.alaska.edu/asf_search/downloading/)
- [Official NISAR product-property implementation](https://github.com/asfadmin/Discovery-asf_search/blob/master/asf_search/Products/NISARProduct.py)
- [Official instrument constants](https://github.com/asfadmin/Discovery-asf_search/blob/master/asf_search/constants/INSTRUMENT.py)
- [Official product constants](https://github.com/asfadmin/Discovery-asf_search/blob/master/asf_search/constants/PRODUCT_TYPE.py)
