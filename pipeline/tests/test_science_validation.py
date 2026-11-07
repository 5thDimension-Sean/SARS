"""Synthetic software regression fixtures, not NASA observations."""
import io

import h5py
import numpy as np
import pytest

from pipeline.check_compatibility import dataset, file_checks
from pipeline.science_validation import (utc_instant, gamma0_check, PARAMETERS,
    inspect_quality_grids, screen_power, artifact_profiles)
from pipeline.qa_summary import inspect_qa_summary


def product(time='2026-09-30T00:05:12.000000000',direction='Descending'):
    return {'times':{'BeginningDateTime':'2026-09-30T00:05:12.000000Z'},
            'attributes':{'ASCENDING_DESCENDING':['DESCENDING']},
            'hdf5':{'identification':{'zeroDopplerStartTime':time,'orbitPassDirection':direction},'frequencies':{}}}


def status(p,field):
    return next(c['status'] for c in file_checks(p) if c['name']=='HDF5 '+field)


def test_documented_utc_and_enum_case_are_equivalent():
    assert status(product(),'zeroDopplerStartTime') == 'PASS'
    assert status(product(),'orbitPassDirection') == 'PASS'
    assert utc_instant('2026-09-30T01:05:12+01:00') == utc_instant('2026-09-30T00:05:12Z')


@pytest.mark.parametrize('time',['2026-09-30T00:05:12.000000001','2026-09-30T00:05:13Z',
    '2026-09-29T00:05:12Z','2026-09-30T00:05:12+01:00','not-a-time','2026-02-30T00:05:12Z'])
def test_genuine_timestamp_differences_and_invalid_values_fail(time):
    assert status(product(time=time),'zeroDopplerStartTime') == 'FAIL'


@pytest.mark.parametrize('direction',['Ascending','sideways','DESC',''])
def test_direction_mismatches_and_unknown_values_fail(direction):
    assert status(product(direction=direction),'orbitPassDirection') == 'FAIL'


def gamma_metadata(normalization='gamma0',expression='linear power',units='1'):
    return {'identification':{'productType':'GCOV','radarBand':'L'},
            'qualityScalars':{PARAMETERS+'rtc/'+key:{'status':'PASS','value':v} for key,v in [
                ('outputBackscatterNormalizationConvention',normalization),
                ('outputBackscatterExpressionConvention',expression)]},
            'frequencies':{'frequencyA':{'datasets':{p:{'attributes':{'units':units}} for p in ('HHHH','HVHV')}}}}


def test_gamma0_requires_values_not_only_inventory():
    assert gamma0_check(gamma_metadata())[0]=='PASS'
    assert gamma0_check({})[0]=='UNVERIFIED'
    assert gamma0_check(gamma_metadata(normalization='sigma0'))[0]=='FAIL'
    assert gamma0_check(gamma_metadata(expression='decibel'))[0]=='FAIL'
    assert gamma0_check(gamma_metadata(units='dB'))[0]=='FAIL'


@pytest.mark.parametrize('shape,scales,semantics,applied',[
    ((2,2),True,True,True),((3,3),True,True,False),
    ((2,2),False,True,False),((2,2),True,False,False)])
def test_exception_mask_requires_grid_and_semantics(shape,scales,semantics,applied):
    prefix='/science/LSAR/GCOV/grids/frequencyA/'
    with h5py.File(io.BytesIO(),'w') as h5:
        g=h5.create_group(prefix)
        for axis in ('x','y'):
            g[axis+'Coordinates']=np.arange(shape[0])
            g[axis+'Coordinates'].make_scale(axis)
        g['inputDataExceptionMask']=np.zeros(shape,dtype='u1')
        g['inputDataExceptionMask'][0,0]=2
        if scales:
            for i,axis in enumerate(('y','x')):
                g['inputDataExceptionMask'].dims[i].attach_scale(g[axis+'Coordinates'])
        metadata={'frequencies':{'frequencyA':{'shape':[2,2],'window':[0,2,0,2]}},
                  'qualityDatasetInventory':[{'path':prefix+'inputDataExceptionMask','shape':list(shape),
                     'attributes':{'description':'Bitwise OR (0: no anomaly, 2: sample slip)' if semantics else 'unknown'}}]}
        mask=inspect_quality_grids(h5,metadata,'frequencyA',dataset)
        assert (mask is not None) == applied
        record=metadata['frequencies']['frequencyA']['qualityLayers'][prefix+'inputDataExceptionMask']
        assert record['appliedToMask'] == applied
        if applied:
            assert int(mask.sum()) == 1
        else:
            assert record['status']=='UNVERIFIED'


def test_disjoint_exclusions_and_conservative_exception_bits():
    power=np.array([[np.nan,-1,1],[1,1,1]],dtype='f4')
    mask=np.array([[0,0,0],[255,1,1]],dtype='u1')
    exception=np.array([[False,False,False],[False,True,False]])
    valid,counts=screen_power(power,mask,None,exception)
    assert int(valid.sum())==1
    assert counts['nonfinitePower']==1 and counts['nonpositivePower']==1
    assert counts['partiallyFocusedOrInvalidEnsemble']==1 and counts['outsideAcquisition']==1
    assert counts['inputDataException']==1
    assert sum(v for k,v in counts.items() if k!='total')==counts['total']
    assert artifact_profiles(power,np.zeros_like(valid))['rowMedianLinearPower']==[None,None]


def test_qa_cannot_exceed_remaining_product_budget():
    class NoRequests:
        def get(self,*a,**k): pytest.fail('No request permitted')
    source={'url':'https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/test.csv',
            'file':{'SizeInBytes':1000}}
    assert inspect_qa_summary(NoRequests(),source,999)['status']=='UNVERIFIED'


def test_qa_reads_rows_but_never_clears_scientific_review():
    from pipeline.tests.test_sources import Session
    body=b'test,result\nexample,FAIL\n'
    source={'url':'https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/test.csv',
            'file':{'SizeInBytes':len(body)}}
    result=inspect_qa_summary(Session(body),source,len(body))
    assert result['status']=='PASS'  # Retrieval only.
    assert result['rows'][1][1]=='FAIL'
    assert result['scientificReview'].startswith('UNVERIFIED')
    assert result['transfer']['bodyBytesConsumed']==len(body)


def test_common_support_is_intersection_after_per_date_exclusions():
    from pipeline.check_compatibility import pair_checks
    grid={'crs':'EPSG:32617','roiShape':[2,2],'spacing':[10,-10],
          'roiFirstCenter':[1,1],'exceptionScreenAvailable':True}
    products=[{'hdf5':{'frequencies':{'frequencyA':grid}}} for _ in range(2)]
    masks=[{('frequencyA','HHHH'):np.array([[True,False],[True,True]])},
           {('frequencyA','HHHH'):np.array([[True,True],[False,True]])}]
    checks=pair_checks(products,masks)
    result=next(c for c in checks if c['name']=='frequencyA HHHH common screened pixels')
    assert result['detail']=='2'


def test_unconfirmed_subswath_mask_never_produces_valid_counts():
    from pipeline.tests.test_sources import synthetic
    from pipeline.check_compatibility import inspect_metadata,inspect_roi
    with h5py.File(io.BytesIO(synthetic()),'r+') as h5:
        mask=h5['/science/LSAR/GCOV/grids/frequencyA/mask']
        mask.attrs['description']='unknown'
        metadata=inspect_metadata(h5,[-80.86,25.45,-80.75,25.56],250000)
        masks=inspect_roi(h5,metadata)
        assert masks=={}
        assert metadata['frequencies']['frequencyA']['screenedPixels']['HHHH'] is None
