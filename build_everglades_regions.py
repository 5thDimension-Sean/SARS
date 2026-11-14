"""Build three reproducible, exploratory Everglades NISAR regions.

Run from the SARS repository root:
    python build_everglades_regions.py

Reads *real* frequencyA HH/HV arrays from the two configured NASA NISAR
products via existing partial range-reader code; never downloads full HDF5.
Outputs to frontend/public/data/everglades-regions/. Requires EARTHDATA_TOKEN
in the current terminal as with analyze_everglades_observations.py.

All outputs are exploratory and NOT CLEARED for quantitative environmental
change claims. Regions are selected by numerical radar response only.
"""
from __future__ import annotations

import json
from pathlib import Path

import h5py
import numpy as np
import requests
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import transform as transform_coordinates

from pipeline.check_compatibility import GRID, catalog, dataset, inspect_metadata
from pipeline.common import power_to_db
from pipeline.fetch_nisar import authenticated_session, load_asf
from pipeline.science_validation import gamma0_check, inspect_quality_grids, screen_power
from pipeline.sources import RangeReader

ROOT = Path(__file__).resolve().parent
STUDY = ROOT / 'pipeline/studies/everglades_20260930_20261012.json'
OUT = ROOT / 'frontend/public/data/everglades-regions'
MAX_SOURCE_BYTES = 64 * 1024**2
POLARIZATIONS = {'HH': 'HHHH', 'HV': 'HVHV'}
QA_WARNING = ('EXPLORATORY ONLY — NOT CLEARED FOR QUANTITATIVE ANALYSIS. '
              'Both official identification-group QA checks failed; '
              'RFI/banding/noise and other radiometric artifacts are unverified. '
              'Radar differences do not establish flooding, vegetation loss, or damage.')


def read_acquisition(auth, public, concept, expected_date, roi, max_pixels):
    info = catalog(public, concept, roi)
    if info['times']['BeginningDateTime'][:10] != expected_date:
        raise RuntimeError(f'Acquisition date mismatch: {concept}')
    if not info['catalogRoiCovered']:
        raise RuntimeError(f'Catalog does not cover ROI: {concept}')
    reader = RangeReader(auth, info['url'], int(info['file']['SizeInBytes']), max_bytes=MAX_SOURCE_BYTES)
    try:
        with reader, h5py.File(reader, 'r') as h5:
            meta = inspect_metadata(h5, roi, max_pixels)
            ident = meta['identification']
            if ident.get('trackNumber') != 170 or ident.get('frameNumber') != 76:
                raise RuntimeError('Unexpected track/frame')
            grid = meta['frequencies'].get('frequencyA')
            if grid is None or not grid['gridCoversRoi']:
                raise RuntimeError('Frequency A missing or does not cover ROI')
            gamma_status, detail = gamma0_check(meta)
            if gamma_status != 'PASS':
                raise RuntimeError(f'Gamma0 validation {gamma_status}: {detail}')
            prefix = GRID + 'frequencyA/'
            r0, r1, c0, c1 = grid['window']
            mask_ds = dataset(h5, prefix + 'mask')
            mask_scales = [[d.name for d in mask_ds.dims[i].values()] for i in range(2)]
            description = grid['datasets']['mask']['attributes'].get('description', '').lower()
            if not (mask_scales == [[prefix + 'yCoordinates'], [prefix + 'xCoordinates']]
                    and 'partially focused' in description
                    and '255' in description and 'value 0' in description):
                raise RuntimeError('Source mask semantics not established')
            mask = np.asarray(mask_ds[r0:r1, c0:c1])
            exception = inspect_quality_grids(h5, meta, 'frequencyA', dataset)
            dx, dy = [float(v) for v in grid['spacing']]
            x0, y0 = [float(v) for v in grid['roiFirstCenter']]
            affine = Affine(dx, 0, x0 - dx / 2, 0, dy, y0 - dy / 2)
            arrays = {}
            counts = {}
            for name, dsname in POLARIZATIONS.items():
                ds = dataset(h5, prefix + dsname)
                power = np.asarray(ds[r0:r1, c0:c1])
                valid, counts[name] = screen_power(power, mask, ds.attrs.get('_FillValue'), exception)
                if not np.any(valid):
                    raise RuntimeError(f'No screened pixels: {expected_date}, {name}')
                arrays[name] = np.asarray(power_to_db(np.where(valid, power, np.nan)), dtype=np.float32)
            return {
                'conceptId': concept, 'date': expected_date, 'arrays': arrays,
                'crs': str(grid['crs']), 'transform': affine,
                'shape': tuple(grid['roiShape']), 'spacing': [dx, dy],
                'firstCenter': [x0, y0], 'counts': counts,
            }
    finally:
        reader.close()


def matches(a, b):
    return (a['crs'] == b['crs'] and a['shape'] == b['shape']
            and np.allclose(a['firstCenter'], b['firstCenter'], atol=1e-5, rtol=0)
            and np.allclose(a['spacing'], b['spacing'], atol=1e-8, rtol=0)
            and all(a['arrays'][p].shape == b['arrays'][p].shape == a['shape']
                    for p in POLARIZATIONS))


def round_float(n, digits=3):
    return round(float(n), digits)


def region_geometry(transform, crs, top, bottom, left, right):
    # Polygon follows native pixel boundaries, then is transformed to WGS84.
    corners = [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]
    xx = [float((transform * (c, r))[0]) for c, r in corners]
    yy = [float((transform * (c, r))[1]) for c, r in corners]
    lons, lats = transform_coordinates(CRS.from_string(crs), CRS.from_epsg(4326), xx, yy)
    return {'type': 'Polygon', 'coordinates': [[[round_float(x, 8), round_float(y, 8)]
                                               for x, y in zip(lons, lats)]]}


def summarize(diff, common, box):
    r0, r1, c0, c1 = box
    pixels = diff[r0:r1, c0:c1][common[r0:r1, c0:c1]]
    if not pixels.size:
        return None
    return {
        'pixels': int(pixels.size),
        'medianDifferenceDb': round_float(np.median(pixels)),
        'meanDifferenceDb': round_float(np.mean(pixels)),
        'p05DifferenceDb': round_float(np.percentile(pixels, 5)),
        'p95DifferenceDb': round_float(np.percentile(pixels, 95)),
    }


def select_boxes(hh, hv, common, height, width):
    # Spatially distinct native-grid tiles. This modest fixed tile size
    # deliberately avoids claiming object boundaries or physical land cover.
    tile = 80
    step = 40
    candidates = []
    for r in range(0, height - tile + 1, step):
        for c in range(0, width - tile + 1, step):
            box = (r, r + tile, c, c + tile)
            n = int(common[r:r+tile, c:c+tile].sum())
            if n < tile * tile * 0.9:
                continue
            hs = summarize(hh, common, box)
            vs = summarize(hv, common, box)
            if hs is not None and vs is not None:
                candidates.append((box, hs, vs))
    if len(candidates) < 3:
        raise RuntimeError('Not enough valid candidate windows; do not force three regions')

    def overlap_with_buffer(box_a, box_b, margin=20):
        a0, a1, a2, a3 = box_a
        b0, b1, b2, b3 = box_b
        return not (a1 + margin <= b0 or b1 + margin <= a0
                    or a3 + margin <= b2 or b3 + margin <= a2)

    selected = []
    goals = [
        ('A', 'Relatively increasing HH radar return',
         lambda x: x[1]['medianDifferenceDb']),
        ('B', 'Relatively decreasing HH radar return',
         lambda x: -x[1]['medianDifferenceDb']),
        ('C', 'Lower-magnitude paired HH/HV differences',
         lambda x: -(abs(x[1]['medianDifferenceDb']) + abs(x[2]['medianDifferenceDb']))),
    ]
    for ident, title, score in goals:
        possible = [entry for entry in candidates
                    if not any(overlap_with_buffer(entry[0], prev[0]) for prev in selected)]
        if not possible:
            raise RuntimeError(f'Unable to select three separated regions: {ident}')
        chosen = max(possible, key=score)
        selected.append((chosen[0], chosen[1], chosen[2], ident, title))
    return selected


def make_difference_png(diff, valid, output, max_abs=6.0):
    """Red/blue visual of exploratory dB differences, transparent for invalid pixels.

    Palette is explicitly signed and clipped: red positive, blue negative,
    near-white zero; do not infer physically meaningful change from this.
    """
    clipped = np.clip(np.nan_to_num(diff, nan=0), -max_abs, max_abs) / max_abs
    a = np.abs(clipped)
    rgb = np.empty((*diff.shape, 4), dtype=np.uint8)
    rgb[:, :, 0] = np.where(clipped >= 0, 245, 255 * (1 - a)).astype(np.uint8)
    rgb[:, :, 1] = (245 * (1 - a)).astype(np.uint8)
    rgb[:, :, 2] = np.where(clipped <= 0, 245, 255 * (1 - a)).astype(np.uint8)
    rgb[:, :, 3] = np.where(valid, 255, 0).astype(np.uint8)
    # PNG image rows remain north-up when source affine has negative y spacing.
    Image.fromarray(rgb, 'RGBA').save(output)


def main():
    config = json.loads(STUDY.read_text(encoding='utf-8'))
    roi = config['roiWgs84']
    if len(config['granules']) != 2 or len(config['expectedDates']) != 2:
        raise RuntimeError('Expected exactly two configured products and dates')
    auth = authenticated_session(load_asf())
    try:
        with requests.Session() as public:
            acquisitions = [read_acquisition(auth, public, concept, date, roi,
                                             int(config['maxRoiPixels']))
                            for concept, date in zip(config['granules'], config['expectedDates'], strict=True)]
    finally:
        auth.close()
    before, after = acquisitions
    if not matches(before, after):
        raise RuntimeError('Source grids do not align exactly; refusing pixel subtraction')
    hh_valid = np.isfinite(before['arrays']['HH']) & np.isfinite(after['arrays']['HH'])
    hv_valid = np.isfinite(before['arrays']['HV']) & np.isfinite(after['arrays']['HV'])
    common = hh_valid & hv_valid
    if common.sum() < 0.9 * np.prod(before['shape']):
        raise RuntimeError('Too few pixels have paired HH AND HV observations')
    diffs = {pol: np.where(common, after['arrays'][pol] - before['arrays'][pol], np.nan)
             for pol in POLARIZATIONS}
    height, width = before['shape']
    selected = select_boxes(diffs['HH'], diffs['HV'], common, height, width)
    OUT.mkdir(parents=True, exist_ok=True)
    features = []
    annotations = []
    for box, hhs, hvs, ident, title in selected:
        r0, r1, c0, c1 = box
        region_before_after = {}
        for pol in POLARIZATIONS:
            mask_window = common[r0:r1, c0:c1]
            arr0 = before['arrays'][pol][r0:r1, c0:c1][mask_window]
            arr1 = after['arrays'][pol][r0:r1, c0:c1][mask_window]
            region_before_after[pol] = {
                'beforeMedianDb': round_float(np.median(arr0)),
                'afterMedianDb': round_float(np.median(arr1)),
                'pairedDifference': hhs if pol == 'HH' else hvs,
            }
        geometry = region_geometry(before['transform'], before['crs'], r0, r1, c0, c1)
        properties = {
            'id': ident, 'title': title,
            'selectionMethod': '80x80 native-pixel window; nonoverlapping 20-pixel separation; exploratory score',
            'rowRange': [r0, r1], 'columnRange': [c0, c1],
            'pixelSpacingMeters': before['spacing'],
            'stats': region_before_after,
            'scientificStatus': 'EXPLORATORY_NOT_CLEARED',
            'environmentalConclusion': None,
            'warning': QA_WARNING,
        }
        features.append({'type': 'Feature', 'geometry': geometry, 'properties': properties})
        annotations.append({
            'id': ident, 'label': title, 'featureId': ident,
            'observation': ('Selected from a reproducible paired-pixel radar-difference search; '
                            'see numeric HH/HV differences in the region statistics.'),
            'interpretation': 'Radar response differs between dates; physical cause unverified.',
            'qaStatus': 'EXPLORATORY_NOT_CLEARED',
        })
    with (OUT / 'regions.geojson').open('w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, indent=2)
    for pol in POLARIZATIONS:
        make_difference_png(diffs[pol], common, OUT / f'{pol}_difference_exploratory.png')
    metadata = {
        'schemaVersion': 'sar-waltz-regions-1.0',
        'study': 'Everglades', 'dates': [before['date'], after['date']],
        'sourceGranules': [before['conceptId'], after['conceptId']],
        'crs': before['crs'], 'nativeShape': list(before['shape']),
        'pixelSpacingMeters': before['spacing'], 'firstPixelCenter': before['firstCenter'],
        'pairedHHAndHVPixels': int(common.sum()),
        'differenceDefinition': 'after dB minus before dB; paired pixel comparison',
        'visualizationScale': {'limitsDb': [-6, 6], 'clipping': True, 'zero': 'near-white',
                               'negative': 'blue', 'positive': 'red'},
        'scientificStatus': 'EXPLORATORY_NOT_CLEARED', 'warning': QA_WARNING,
        'regionCount': len(features), 'regions': [feature['properties'] for feature in features],
        'annotations': annotations,
        'recommendation': ('Display with explicit scientific QA warning and source details. '
                           'Do not label regions flooding, vegetation loss, or damage without validation.'),
    }
    with (OUT / 'regions.json').open('w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print('Created:', OUT / 'regions.json')
    print('Created:', OUT / 'regions.geojson')
    print('Created:', OUT / 'HH_difference_exploratory.png')
    print('Created:', OUT / 'HV_difference_exploratory.png')
    for region in features:
        p = region['properties']
        print(f"Region {p['id']}: {p['title']}; "
              f"HH {p['stats']['HH']['pairedDifference']['medianDifferenceDb']:+.3f} dB, "
              f"HV {p['stats']['HV']['pairedDifference']['medianDifferenceDb']:+.3f} dB")
    print('QA: EXPLORATORY_NOT_CLEARED')


if __name__ == '__main__':
    main()
