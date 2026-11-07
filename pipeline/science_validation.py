"""Strict metadata equivalence and per-acquisition QC; no temporal arithmetic."""
from datetime import datetime, timezone
import re

import numpy as np

GCOV_GUIDE = 'https://nisar-docs.asf.alaska.edu/gcov/'
KNOWN_ISSUES = 'https://nisar-docs.asf.alaska.edu/provisional-known-issues/'
UTC_FORMAT = 'https://bhoonidhi.nrsc.gov.in/NISAR/NISAR_Data_Product_Format_Document_V1.2.1_digisigned.pdf'
PARAMETERS = '/science/LSAR/GCOV/metadata/processingInformation/parameters/'


def utc_instant(text):
    """Exact nanoseconds. Only this documented NISAR UTC field may omit a zone."""
    match = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?', str(text))
    if not match:
        raise ValueError('Invalid documented UTC timestamp')
    whole, fraction, zone = match.groups()
    zone = '+00:00' if zone in (None, 'Z') else zone
    stamp = datetime.fromisoformat(whole+zone).astimezone(timezone.utc)
    delta = stamp - datetime(1970,1,1,tzinfo=timezone.utc)
    return (delta.days*86400+delta.seconds)*10**9 + int((fraction or '').ljust(9,'0'))


def orbit_direction(text):
    result = str(text).strip().upper()
    if result not in ('ASCENDING','DESCENDING'):
        raise ValueError('Unknown orbit direction')
    return result


def finite_summary(values):
    valid = np.asarray(values)[np.isfinite(values)]
    return {'finiteCount':int(valid.size), 'nonfiniteCount':int(values.size-valid.size),
            'nonpositiveFiniteCount':int(np.count_nonzero(valid <= 0)),
            'min':float(valid.min()) if valid.size else None,
            'max':float(valid.max()) if valid.size else None}


def scalar_evidence(h5, inventory, read_value):
    evidence = {}
    for item in inventory:
        if item['shape'] not in ([],[1]):
            continue
        path = item['path']
        try:
            raw = read_value(h5,path)
            nonfinite = isinstance(raw,float) and not np.isfinite(raw)
            evidence[path] = {'status':'PASS','value':None if nonfinite else raw,
                              'nonfinite':bool(nonfinite)}
        except (KeyError,ValueError,TypeError):
            evidence[path] = {'status':'UNVERIFIED','reason':'Scalar unavailable or unsupported.'}
    return evidence


def gamma0_check(metadata):
    scalars = metadata.get('qualityScalars',{})
    paths = ['rtc/outputBackscatterNormalizationConvention','rtc/outputBackscatterExpressionConvention']
    records = [scalars.get(PARAMETERS+p,{}) for p in paths]
    if any(r.get('status') != 'PASS' or r.get('value') is None for r in records):
        return 'UNVERIFIED','Required output normalization/expression scalar values have not been read.'
    normalization, expression = [str(r['value']).strip().lower() for r in records]
    # Exact documented meanings, not fuzzy matching or guessed unit conversion.
    if normalization != 'gamma0' or expression != 'linear power':
        return 'FAIL',f'Output convention={normalization}; expression={expression}; expected gamma0 and linear power.'
    grid = metadata.get('frequencies',{}).get('frequencyA',{})
    terms = grid.get('datasets',{})
    if any(terms.get(p,{}).get('attributes',{}).get('units') != '1' for p in ('HHHH','HVHV')):
        return 'FAIL','Frequency A covariance units must explicitly be dimensionless (1).'
    ident = metadata.get('identification',{})
    if ident.get('productType') != 'GCOV' or ident.get('radarBand') != 'L':
        return 'FAIL','Expected L-band GCOV identity.'
    return 'PASS','File declares dimensionless linear gamma0 power; GCOV guide defines calibrated RTC covariance. This does not certify residual calibration accuracy.'


def inspect_quality_grids(h5, metadata, frequency, read_dataset):
    """Read native-grid QC windows; never resize or infer a mismatched grid."""
    grid = metadata['frequencies'][frequency]
    prefix = '/science/LSAR/GCOV/grids/'+frequency+'/'
    r0,r1,c0,c1 = grid['window']
    evidence, exception = {}, None
    for item in metadata['qualityDatasetInventory']:
        path = item['path']
        if not path.startswith(prefix) or item['shape'] in ([],[1]) or path == prefix+'mask':
            continue
        record = {'path':path,'shape':item['shape'],'status':'UNVERIFIED','appliedToMask':False}
        evidence[path] = record
        if item['shape'] != grid['shape']:
            record['reason'] = 'Shape differs from this frequency grid; not read, resized or applied.'
            continue
        ds = read_dataset(h5,path)
        scales = [[s.name for s in ds.dims[i].values()] for i in range(2)]
        record['dimensionScales'] = scales
        expected = [[prefix+'yCoordinates'],[prefix+'xCoordinates']]
        record['nativeGridConfirmed'] = scales == expected
        if scales != expected:
            record['reason'] = 'Coordinate dimension scales do not explicitly match the native grid; not applied.'
            continue
        if ds.dtype.kind not in 'uif':
            record['reason'] = 'Unsupported quality-layer dtype.'
            continue
        values = np.asarray(ds[r0:r1,c0:c1])
        record.update({'status':'PASS','window':grid['window'],'summary':finite_summary(values),
                       'gridEvidence':'Exact shape and attached native x/y coordinate dataset paths.'})
        if ds.dtype.kind in 'ui':
            codes,counts = np.unique(values,return_counts=True)
            record['codeCounts'] = {str(int(k)):int(v) for k,v in zip(codes,counts)}
        if path == prefix+'inputDataExceptionMask':
            description = item.get('attributes',{}).get('description','').lower()
            semantics = 'bitwise or' in description and '0: no anomaly' in description
            record['zeroMeansNoAnomalyConfirmed'] = semantics
            if ds.dtype.kind in 'ui' and semantics:
                exception = values != 0  # Exclude all flagged bits, including unknown ones.
                record['appliedToMask'] = True
                record['policy'] = 'Conservatively exclude every nonzero exception code; do not reinterpret bits.'
            else:
                record['status'] = 'UNVERIFIED'
                record['reason'] = 'No verified integer bitmask/zero-no-anomaly semantics.'
    grid['qualityLayers'] = evidence
    return exception


def screen_power(power, mask, fill, exception):
    """Disjoint exclusions in declared precedence; no inferred artifact threshold."""
    remaining = np.ones(power.shape,dtype=bool)
    counts = {}
    reasons = [('nonfinitePower',~np.isfinite(power)),
               ('declaredFill',power == fill if fill is not None else np.zeros(power.shape,dtype=bool)),
               ('nonpositivePower',power <= 0),('partiallyFocusedOrInvalidEnsemble',mask == 0),
               ('outsideAcquisition',mask == 255)]
    if exception is not None:
        reasons.append(('inputDataException',exception))
    for label,rejected in reasons:
        counts[label] = int(np.count_nonzero(remaining & rejected))
        remaining &= ~rejected
    counts['retained'] = int(remaining.sum())
    counts['total'] = int(power.size)
    return remaining, counts


def artifact_profiles(power, valid):
    """Per-date native-grid profiles are review evidence, never artifact detection."""
    def medians(axis):
        data,mask = (power,valid) if axis == 0 else (power.T,valid.T)
        return [float(np.median(row[m])) if m.any() else None for row,m in zip(data,mask)]
    return {'rowMedianLinearPower':medians(0),'columnMedianLinearPower':medians(1),
            'interpretation':'Native ROI only. Spatial profiles confound land cover with artifacts. No automatic threshold or absence-of-artifacts claim.',
            'noiseFloorAssessment':'UNVERIFIED: no calibrated noise-equivalent backscatter comparison performed.'}
