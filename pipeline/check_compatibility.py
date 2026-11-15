"""Bounded GCOV compatibility inspection. Never computes temporal change."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import platform
import logging
from importlib.metadata import version

import h5py
import numpy as np
import requests
from rasterio.crs import CRS
from rasterio.transform import Affine
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from shapely.geometry import Polygon, box

from .common import parse_bbox
from .fetch_nisar import authenticated_session, load_asf
from .nisar_to_overlays import check_coordinates
from .sources import AccessError, RangeReader, validate_url
from .science_validation import (utc_instant, orbit_direction, scalar_evidence, gamma0_check,
    inspect_quality_grids, screen_power, artifact_profiles, GCOV_GUIDE, KNOWN_ISSUES, UTC_FORMAT)

GRID = '/science/LSAR/GCOV/grids/'
IDENT = '/science/LSAR/identification/'
POLS = ('HHHH', 'HVHV')


def check(name, status, detail, *, scope='automated'):
    return {'name': name, 'status': status, 'detail': detail, 'scope':scope}


def catalog(session, concept, roi):
    if not re.fullmatch(r'G\d+-ASF', concept):
        raise ValueError('Invalid CMR concept ID')
    url = f'https://cmr.earthdata.nasa.gov/search/concepts/{concept}.umm_json'
    with session.get(url, stream=True, timeout=(10, 30), allow_redirects=False,
                     headers={'Accept-Encoding': 'identity'}) as response:
        response.raise_for_status()
        body = response.raw.read(1024**2 + 1)
        if len(body) > 1024**2:
            raise AccessError('Catalog exceeds metadata budget')
        umm = json.loads(body)
        revision = response.headers.get('CMR-Revision-Id')
    primary = [x for x in umm['DataGranule']['ArchiveAndDistributionInformation']
               if x['Name'].endswith('.h5') and not x['Name'].endswith('_QA_STATS.h5')]
    if len(primary) != 1:
        raise AccessError('Expected exactly one primary GCOV HDF5')
    file = primary[0]
    urls = [x['URL'] for x in umm['RelatedUrls'] if x['Type'] == 'GET DATA'
            and x['URL'].endswith('/' + file['Name'])]
    if len(urls) != 1:
        raise AccessError('Ambiguous primary product URL')
    validate_url(urls[0])
    polygons = [Polygon([(p['Longitude'], p['Latitude']) for p in g['Boundary']['Points']])
                for g in umm['SpatialExtent']['HorizontalSpatialDomain']['Geometry']['GPolygons']]
    qa_name = file['Name'].removesuffix('.h5')+'_QA_SUMMARY.csv'
    qa_files = [x for x in umm['DataGranule']['ArchiveAndDistributionInformation'] if x['Name']==qa_name]
    qa_urls = [x['URL'] for x in umm['RelatedUrls'] if x['URL'].startswith('https://nisar.asf.earthdatacloud.nasa.gov/NISAR/') and x['URL'].endswith('/'+qa_name)]
    qa = {'file':qa_files[0],'url':qa_urls[0]} if len(qa_files)==1 and len(qa_urls)==1 else None
    if qa:
        validate_url(qa['url'])
    return {'conceptId': concept, 'catalogUrl': url, 'revision': revision, 'officialQaSource':qa,
            'catalogSha256': hashlib.sha256(body).hexdigest(), 'catalogBodyBytes': len(body),
            'file': file, 'url': urls[0], 'collection': umm['CollectionReference'],
            'times': umm['TemporalExtent']['RangeDateTime'],
            'attributes': {x['Name']: x['Values'] for x in umm['AdditionalAttributes']},
            'identifiers': umm['DataGranule']['Identifiers'], 'pge': umm['PGEVersionClass'],
            'footprints': [list(p.exterior.coords) for p in polygons],
            'catalogRoiCovered': any(p.covers(box(*roi)) for p in polygons)}


def dataset(h5, path):
    """Reject indirect storage before reading any dataset values."""
    current = h5
    for part in path.strip('/').split('/'):
        if not isinstance(current.get(part, getlink=True), h5py.HardLink):
            raise ValueError('Missing dataset or indirect HDF5 link')
        current = current[part]
    if not isinstance(current, h5py.Dataset) or current.is_virtual or current.external:
        raise ValueError('Expected internal, nonvirtual dataset')
    return current


def value(h5, path):
    ds = dataset(h5, path)
    if ds.shape not in ((), (1,)):
        raise ValueError('Expected scalar metadata')
    raw = ds[()] if ds.shape == () else ds[0]
    return raw.decode().strip() if isinstance(raw, bytes) else raw.item() if isinstance(raw, np.generic) else raw


def describe(ds):
    attrs = {}
    for key in ('units', 'long_name', 'description', '_FillValue', 'valid_min', 'valid_max'):
        if key in ds.attrs:
            attr = ds.attrs.get_id(key)
            try:
                if math.prod(attr.shape or (1,)) * attr.dtype.itemsize > 4096:
                    continue
            finally:
                attr.close()
            raw = ds.attrs[key]
            attrs[key] = str(raw.decode() if isinstance(raw, bytes) else raw)[:4096]
    # Persisted evidence uses JSON arrays. Normalize the container here so an
    # unchanged live dataset compares exactly with its saved description; keep
    # contiguous storage as None and preserve every dimension without coercion.
    return {'shape': list(ds.shape), 'dtype': str(ds.dtype),
            'chunks': list(ds.chunks) if ds.chunks is not None else None,
            'compression': ds.compression, 'attributes': attrs}


def inspect_metadata(h5, roi, max_pixels):
    ident = {}
    for name in ('productType', 'radarBand', 'trackNumber', 'frameNumber', 'orbitPassDirection',
                 'zeroDopplerStartTime', 'zeroDopplerEndTime', 'productVersion',
                 'compositeReleaseId', 'productSpecificationVersion', 'dataMaturity'):
        try:
            ident[name] = value(h5, IDENT + name)
        except (KeyError, ValueError):
            ident[name] = None
    result = {'identification': ident, 'frequencies': {}, 'qualityDatasetInventory': []}
    def inventory(name, obj):
        if isinstance(obj, h5py.Dataset) and re.search('mask|quality|rfi|layover|shadow|numberOfLooks|rtc|noise|nesz', name, re.I):
            result['qualityDatasetInventory'].append({'path': '/' + name, **describe(obj)})
    h5.visititems(inventory)  # Hard links only; no external or soft links followed.
    result['qualityScalars'] = scalar_evidence(h5,result['qualityDatasetInventory'],value)
    result['unreadNonGridQualityArrays'] = [item['path'] for item in result['qualityDatasetInventory']
        if item['shape'] not in ([],[1]) and not item['path'].startswith(GRID)]
    for frequency in ('frequencyA', 'frequencyB'):
        prefix = GRID + frequency + '/'
        try:
            shape = dataset(h5, prefix + POLS[0]).shape
        except (KeyError, ValueError):
            continue
        if len(shape) != 2:
            raise ValueError('Expected 2D covariance')
        ds = {p: dataset(h5, prefix + p) for p in (*POLS, 'mask')}
        if any(d.shape != shape for d in ds.values()) or any(ds[p].dtype.kind != 'f' for p in POLS):
            raise ValueError('Polarization/mask grid mismatch or non-real power')
        if ds['mask'].dtype.kind not in 'ui':
            raise ValueError('Mask must be integer')
        dx, dy = (float(value(h5, prefix + key + 'CoordinateSpacing')) for key in ('x', 'y'))
        if not (dx > 0 and dy < 0):
            raise ValueError('Expected north-up grid')
        x0 = check_coordinates(dataset(h5, prefix + 'xCoordinates'), dx, shape[1])
        y0 = check_coordinates(dataset(h5, prefix + 'yCoordinates'), dy, shape[0])
        crs = CRS.from_epsg(int(value(h5, prefix + 'projection')))
        transform = Affine(dx, 0, x0-dx/2, 0, dy, y0-dy/2)
        win = from_bounds(*transform_bounds('EPSG:4326', crs, *roi, densify_pts=21), transform)
        r0, c0 = math.floor(win.row_off), math.floor(win.col_off)
        r1, c1 = math.ceil(win.row_off+win.height), math.ceil(win.col_off+win.width)
        covered = r0 >= 0 and c0 >= 0 and r1 <= shape[0] and c1 <= shape[1]
        r0, r1, c0, c1 = max(0,r0), min(shape[0],r1), max(0,c0), min(shape[1],c1)
        pixels = (r1-r0)*(c1-c0)
        if r1 <= r0 or c1 <= c0 or pixels > max_pixels:
            raise ValueError('Empty or oversized ROI window')
        result['frequencies'][frequency] = {
            'datasets': {p: describe(d) for p,d in ds.items()}, 'crs': str(crs),
            'shape': list(shape), 'spacing': [dx,dy], 'firstCenter': [x0,y0],
            'roiFirstCenter': [x0+c0*dx,y0+r0*dy], 'window': [r0,r1,c0,c1],
            'roiShape': [r1-r0,c1-c0], 'roiPixels': pixels, 'gridCoversRoi': covered}
    return result


def inspect_roi(h5, metadata):
    masks = {}
    for freq, grid in metadata['frequencies'].items():
        r0,r1,c0,c1 = grid['window']
        prefix = GRID+freq+'/'
        mask_dataset = dataset(h5,prefix+'mask')
        mask = mask_dataset[r0:r1,c0:c1]
        mask_scales = [[s.name for s in mask_dataset.dims[i].values()] for i in range(2)]
        description = grid['datasets']['mask']['attributes'].get('description','').lower()
        mask_confirmed = (mask_scales == [[prefix+'yCoordinates'],[prefix+'xCoordinates']]
                          and 'partially focused' in description and '255' in description and 'value 0' in description)
        grid['subswathMaskEvidence'] = {'dimensionScales':mask_scales,'gridAndSemanticsConfirmed':mask_confirmed}
        codes, counts = np.unique(mask, return_counts=True)
        grid['maskCounts'] = dict(zip(map(str,codes), map(int,counts)))
        grid['screenedPixels'] = {}
        grid['exclusions'] = {}
        grid['artifactProfiles'] = {}
        exception = inspect_quality_grids(h5,metadata,freq,dataset)
        grid['exceptionScreenAvailable'] = exception is not None
        for pol in POLS:
            ds = dataset(h5, GRID+freq+'/'+pol)
            power = ds[r0:r1,c0:c1]
            if not mask_confirmed:
                grid['screenedPixels'][pol] = None
                grid['exclusions'][pol] = {'status':'UNVERIFIED','reason':'Subswath mask grid or semantics not confirmed; mask not applied.'}
                continue
            valid,counts = screen_power(power,mask,ds.attrs.get('_FillValue'),exception)
            grid['exclusions'][pol] = counts
            grid['artifactProfiles'][pol] = artifact_profiles(power,valid)
            grid['screenedPixels'][pol] = int(valid.sum())
            if mask_confirmed:
                masks[(freq,pol)] = valid
        grid['screeningCaveat'] = 'Disjoint exclusions recorded in precedence order. Exception codes excluded only when native grid and zero-no-anomaly semantics are verified. All counts remain provisional pending QA/artifact review.'
    return masks


def pair_checks(products, masks):
    checks = []
    for freq in ('frequencyA','frequencyB'):
        grids = [p.get('hdf5',{}).get('frequencies',{}).get(freq) for p in products]
        if not all(grids):
            checks.append(check(freq+' grid and paired pixels', 'UNVERIFIED', 'Both HDF5 grids must be read.'))
            continue
        a,b = grids
        aligned = (a['crs'] == b['crs'] and a['roiShape'] == b['roiShape']
                   and np.allclose(a['spacing'],b['spacing'],rtol=0,atol=1e-8)
                   and np.allclose(a['roiFirstCenter'],b['roiFirstCenter'],rtol=0,atol=1e-6))
        checks.append(check(freq+' ROI pixel alignment', 'PASS' if aligned else 'FAIL',
                            'CRS, pixel spacing, ROI shape and centers compared; no resampling.'))
        for pol in POLS:
            if aligned and all((freq,pol) in m for m in masks):
                n = int(np.count_nonzero(masks[0][freq,pol] & masks[1][freq,pol]))
                checks.append(check(freq+' '+pol+' common screened pixels', 'PASS' if n else 'FAIL', str(n)))
                complete = a.get('exceptionScreenAvailable',False) and b.get('exceptionScreenAvailable',False)
                checks.append(check(freq+' '+pol+' common exception-screened support',
                    ('PASS' if n else 'FAIL') if complete else 'UNVERIFIED',
                    str(n)+' common pixels; not final scientific certification.' if complete else 'Exception screening unavailable for one or both dates.'))
            else:
                checks.append(check(freq+' '+pol+' common screened pixels','UNVERIFIED','ROI reads/alignment incomplete.'))
    return checks


def file_checks(product):
    metadata = product.get('hdf5')
    if not metadata:
        return [check('Actual HDF5 identity, datasets and ROI coverage','UNVERIFIED','HDF5 metadata unavailable.')]
    checks = []
    ident = metadata['identification']
    expected = {'productType':'GCOV','radarBand':'L',
                'zeroDopplerStartTime':product['times']['BeginningDateTime']}
    for key, attribute in (('trackNumber','TRACK_NUMBER'),('frameNumber','FRAME_NUMBER'),
                            ('orbitPassDirection','ASCENDING_DESCENDING'),('productVersion','PRODUCT_VERSION')):
        expected[key] = product['attributes'].get(attribute,[None])[0]
    for key, target in expected.items():
        actual = ident.get(key)
        matches = str(actual) == str(target)
        if key == 'zeroDopplerStartTime' and actual and target:
            try:
                matches = utc_instant(actual) == utc_instant(target)
            except ValueError:
                matches = False
        if key == 'orbitPassDirection' and actual and target:
            try:
                matches = orbit_direction(actual) == orbit_direction(target)
            except ValueError:
                matches = False
        checks.append(check('HDF5 '+key,'UNVERIFIED' if actual is None or target is None else 'PASS' if matches else 'FAIL',
                            f'HDF5={actual}; catalog/required={target}'))
    for freq in ('frequencyA','frequencyB'):
        grid = metadata['frequencies'].get(freq)
        checks.append(check(freq+' required real covariance datasets','PASS' if grid else 'FAIL','HHHH, HVHV and integer mask on matching grids required.'))
        if grid:
            checks.append(check(freq+' grid ROI coverage','PASS' if grid['gridCoversRoi'] else 'FAIL','Native grid coverage; quality screening remains separate.'))
            for pol in POLS:
                units = grid['datasets'][pol]['attributes'].get('units')
                checks.append(check(freq+' '+pol+' declared units','UNVERIFIED' if units is None else 'PASS',str(units)+'; presence only, calibration semantics require review.'))
    status,detail = gamma0_check(metadata)
    checks.append(check('Frequency A declared gamma0 linear-power convention',status,detail))
    for freq,grid in metadata['frequencies'].items():
        checks.append(check(freq+' subswath-mask grid and semantics',
            'PASS' if grid.get('subswathMaskEvidence',{}).get('gridAndSemanticsConfirmed') else 'UNVERIFIED',
            'Requires attached native coordinate scales and explicit mask 0/255 semantics; otherwise common counts are withheld.'))
        for path,evidence in grid.get('qualityLayers',{}).items():
            checks.append(check(path+' native-grid QC inspection',evidence['status'],
                                evidence.get('reason',evidence.get('gridEvidence',''))))
        checks.append(check(freq+' exception-mask screening','PASS' if grid.get('exceptionScreenAvailable') else 'UNVERIFIED',
                            'Only confirmed native-grid, integer zero-no-anomaly masks are applied.'))
    return checks


def run(config, *, require_auth=False):
    roi = parse_bbox(','.join(map(str,config['roiWgs84'])))
    report = {'schemaVersion':'1.1', 'generatedUtc':datetime.now(timezone.utc).isoformat(),
              'config':config, 'products':[], 'checks':[], 'verdict':'NOT CLEARED FOR QUANTITATIVE ANALYSIS',
              'runtime':{'python':platform.python_version(), **{p:version(p) for p in ('h5py','numpy','requests','asf_search','rasterio')}},
              'codeSha256':{p:hashlib.sha256(Path(__file__).with_name(p).read_bytes()).hexdigest()
                            for p in ('check_compatibility.py','sources.py','fetch_nisar.py','nisar_to_overlays.py','science_validation.py','qa_summary.py')},
              'references':{'gcov':GCOV_GUIDE,'knownIssues':KNOWN_ISSUES,'utcFormat':UTC_FORMAT},
              'transferAccounting':'Response body bytes consumed by catalog/range reader only; excludes HTTP/TLS overhead, auth exchanges and earlier exploratory requests.',
              'limitations':['No temporal differences or environmental interpretation calculated.',
                  'ROI is a bounding window enclosing a proposed 0.04-degree study box, not a final ecological sampling design.',
                  'Full file checksum cannot be verified from partial ranges.',
                  'Quality layers, official QA and radiometric artifacts require review before scientific clearance.',
                  'Identical processing versions do not prove absence of calibration bias.']}
    try:
        auth = authenticated_session(load_asf())
        report['authentication'] = 'Earthdata authenticated session established'
    except Exception:
        if require_auth:
            report['authentication'] = 'Authentication unavailable or rejected; diagnostics withheld.'
            report['checks'].append(check('Earthdata authentication','UNVERIFIED','No product requests attempted. Configure credentials in this process and retry.'))
            return report
        auth = requests.Session()
        report['authentication'] = 'Not authenticated; credentials missing, invalid, or authentication unavailable. Anonymous range probe only.'
    all_masks = []
    try:
        with requests.Session() as public:
            # Public catalog requests never receive Earthdata session headers.
            for concept,date in zip(config['granules'],config['expectedDates'],strict=True):
                product = {'conceptId':concept}
                report['products'].append(product)
                masks = {}
                all_masks.append(masks)
                try:
                    product.update(catalog(public,concept,roi))
                except Exception:
                    report['checks'].append(check(concept+' catalog','UNVERIFIED','Public metadata unavailable or malformed; diagnostics withheld.'))
                    continue
                report['checks'].extend([
                    check(concept+' catalog date','PASS' if product['times']['BeginningDateTime'][:10] == date else 'FAIL','CMR acquisition start UTC'),
                    check(concept+' catalog ROI coverage','PASS' if product['catalogRoiCovered'] else 'FAIL','Catalog polygon only; does not establish raster validity.')])
                reader = RangeReader(auth,product['url'],int(product['file']['SizeInBytes']))
                product['inspectionStage'] = 'opening HDF5'
                try:
                    with reader:
                        with h5py.File(reader,'r') as h5:
                            product['inspectionStage'] = 'metadata'
                            product['hdf5'] = inspect_metadata(h5,roi,int(config['maxRoiPixels']))
                            product['metadataBodyBytes'] = reader.bytes_transferred
                            product['inspectionStage'] = 'ROI'
                            masks.update(inspect_roi(h5,product['hdf5']))
                            product['roiBodyBytes'] = reader.bytes_transferred - product['metadataBodyBytes']
                            product['inspectionStage'] = 'complete'
                    report['checks'].append(check(concept+' HDF5/ROI access','PASS','Metadata then bounded ROI read completed.'))
                except Exception:
                    # h5py/requests exception text can embed credential-bearing URLs.
                    report['checks'].append(check(concept+' HDF5/ROI access','UNVERIFIED','Read incomplete: authentication, range support, transfer cap, or product structure. See safe transfer audit.'))
                finally:
                    product['transfer'] = reader.audit()
                    reader.close()
                    report['checks'].append(check(concept+' HTTP byte-range support',
                        'PASS' if product['transfer']['verified206Responses'] else
                        'FAIL' if product['transfer']['lastHttpStatus'] == 200 else 'UNVERIFIED',
                        'Exact 206/Content-Range verified; see transfer evidence.' if product['transfer']['verified206Responses'] else
                        product['transfer']['safeError'] or 'No verified range response.'))
                from .qa_summary import inspect_qa_summary
                product['officialQa'] = inspect_qa_summary(auth,product.get('officialQaSource'),
                    64*1024**2-product['transfer']['bodyBytesConsumed'])
                product['totalProductBodyBytes'] = product['transfer']['bodyBytesConsumed'] + product['officialQa'].get('transfer',{}).get('bodyBytesConsumed',0)
                report['checks'].append(check(concept+' official QA summary retrieval',product['officialQa']['status'],
                                            product['officialQa']['detail']))
    finally:
        auth.close()
    for product in report['products']:
        report['checks'].extend({**c,'name':product['conceptId']+' '+c['name']} for c in file_checks(product))
    if len(report['products']) == 2:
        for key in ('TRACK_NUMBER','FRAME_NUMBER','ASCENDING_DESCENDING','PRODUCT_VERSION',
                    'FREQUENCY_A_POLARIZATION','FREQUENCY_B_POLARIZATION','RANGE_BANDWIDTH_CONCAT','JOINT_OBSERVATION'):
            vals = [p.get('attributes',{}).get(key) for p in report['products']]
            report['checks'].append(check('Catalog '+key,'UNVERIFIED' if not all(vals) else 'PASS' if vals[0] == vals[1] else 'FAIL',str(vals)))
        report['checks'].extend(pair_checks(report['products'],all_masks))
    for name in ('Actual HDF5 units and calibration semantics','Official QA and quality-mask interpretation',
                 'Radiometric artifact review (banding, RFI, seams, noise floor)', 'Defensible paired analysis'):
        report['checks'].append(check(name,'UNVERIFIED','Requires explicit scientific review of collected evidence; not cleared by transport, metadata agreement or pixel counts.',scope='manual'))
    return report


def main():
    # urllib3 DEBUG output includes complete URLs. Never allow it for signed URLs.
    logging.getLogger('urllib3.connectionpool').disabled = True
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=Path('pipeline/studies/everglades_20260930_20261012.json'))
    parser.add_argument('--output',type=Path,required=True,help='New JSON file; existing files are never overwritten')
    parser.add_argument('--require-auth',action='store_true',help='Stop before product requests if Earthdata authentication fails')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new report filename')
    config = json.loads(args.config.read_text(encoding='utf-8'))
    report = run(config,require_auth=args.require_auth)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('x',encoding='utf-8') as stream:
        json.dump(report,stream,indent=2,allow_nan=False)
        stream.write('\n')
    print(report['verdict'])
    print('Report:',args.output)
    print('Authentication:',report['authentication'])
    print('Checks:', {status:sum(c['status']==status for c in report['checks']) for status in ('PASS','FAIL','UNVERIFIED')})
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
