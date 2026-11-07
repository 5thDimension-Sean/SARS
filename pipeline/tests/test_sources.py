"""Offline synthetic transport tests; fixtures are not NASA observations."""
import io
import re

import h5py
import numpy as np
import pytest

from pipeline.sources import AccessError, RangeReader
from pipeline.check_compatibility import dataset, pair_checks, inspect_metadata, inspect_roi, file_checks

URL = 'https://nisar.asf.earthdatacloud.nasa.gov/NISAR/NISAR_L2_GCOV_PROVISIONAL_V1/test.h5'


class Response:
    def __init__(self, data, status, headers):
        self.raw = io.BytesIO(data)
        self.status_code, self.headers = status, headers
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def close(self): pass


class Session:
    def __init__(self,data):
        self.data, self.calls = data, []
        self.status, self.overrides = 206, {}
    def get(self,url,**kwargs):
        self.calls.append(kwargs)
        start,end = map(int,re.findall(r'\d+',kwargs['headers']['Range']))
        headers = {'Content-Range':f'bytes {start}-{end}/{len(self.data)}','ETag':'"v1"', **self.overrides}
        self.response = Response(self.data[start:end+1],self.status,headers)
        return self.response


def reader(session,**kwargs):
    return RangeReader(session,URL,len(session.data),block_size=4,cache_bytes=8,max_bytes=16,**kwargs)


def test_ranges_cache_seek_and_budget():
    s = Session(b'abcdefghijklmnopqrstuvwx')
    with reader(s) as r:
        assert r.read(6) == b'abcdef'
        r.seek(0)
        assert r.read(2) == b'ab'
        assert r.requests == 2
        r.seek(8)
        assert r.read(8) == b'ijklmnop'
        assert r.cache_peak == 8
        assert r.bytes_transferred == 16
        r.seek(0)
        with pytest.raises(AccessError,match='budget'): r.read(1)
        assert not r.writable()
    assert not r.cache


@pytest.mark.parametrize('status',[200,302,401,403,500])
def test_reject_full_download_or_login_without_body(status):
    s = Session(b'abcdefghijkl')
    s.status = status
    with reader(s) as r:
        with pytest.raises(AccessError): r.read(1)
        assert r.bytes_transferred == 0
        assert s.response.raw.tell() == 0
        assert s.calls[0]['allow_redirects'] is False


@pytest.mark.parametrize('headers',[{'Content-Range':'bytes 0-3/99'}, {'Content-Type':'text/html'}, {'Content-Encoding':'gzip'}])
def test_reject_invalid_ranges(headers):
    s = Session(b'abcdefgh')
    s.overrides = headers
    with reader(s) as r:
        with pytest.raises(AccessError): r.read(1)
        assert r.bytes_transferred == 0


def test_changed_etag_and_oversized_read():
    s = Session(b'abcdefghijkl')
    with reader(s) as r:
        with pytest.raises(AccessError): r.read()
        assert not s.calls
        r.read(4)
        s.overrides['ETag'] = '"v2"'
        with pytest.raises(AccessError,match='changed'): r.read(1)
        assert s.calls[-1]['headers']['If-Match'] == '"v1"'


def test_sanitized_network_error():
    class Broken:
        def get(self,*args,**kwargs): raise RuntimeError('secret-token')
    with RangeReader(Broken(),URL,10,block_size=4,cache_bytes=8,max_bytes=16) as r:
        with pytest.raises(AccessError) as caught: r.read(1)
        assert 'secret' not in str(caught.value)


@pytest.mark.parametrize('url',['http://example.com/a', URL+'?token=secret', URL.replace('nisar.asf.earthdatacloud.nasa.gov','evil.test')])
def test_host_restrictions(url):
    with pytest.raises(AccessError): RangeReader(None,url,100)


def synthetic():
    memory = io.BytesIO()
    with h5py.File(memory,'w') as h5:
        g = h5.create_group('/science/LSAR/GCOV/grids/frequencyA')
        g['HHHH'] = np.ones((10,10),dtype='f4')
        g['HVHV'] = np.ones((10,10),dtype='f4')
        g['HHHH'].attrs['units'] = '1'
        g['mask'] = np.ones((10,10),dtype='u1')
        g['mask'][0,0] = 255
        g['HVHV'][1,1] = np.nan
        g['xCoordinates'] = np.arange(10)*0.01-80.85
        g['yCoordinates'] = 25.55-np.arange(10)*0.01
        g['xCoordinateSpacing'] = 0.01
        g['yCoordinateSpacing'] = -0.01
        g['projection'] = 4326
        for axis in ('x','y'):
            g[axis+'Coordinates'].make_scale(axis)
        for i,axis in enumerate(('y','x')):
            g['mask'].dims[i].attach_scale(g[axis+'Coordinates'])
        g['mask'].attrs['description'] = 'If partially focused the mask pixel has value 0; outside acquisition is 255.'
    return memory.getvalue()


def test_real_h5py_fileobject_metadata_and_roi():
    data = synthetic()
    session = Session(data)
    with RangeReader(session,URL,len(data),block_size=1024,cache_bytes=32768,max_bytes=131072) as r:
        with h5py.File(r,'r') as h5:
            meta = inspect_metadata(h5,[-80.86,25.45,-80.75,25.56],250000)
            masks = inspect_roi(h5,meta)
            assert meta['frequencies']['frequencyA']['screenedPixels'] == {'HHHH':99,'HVHV':98}
            checks = pair_checks([{'hdf5':meta},{'hdf5':meta}],[masks,masks])
            assert any(c['status']=='PASS' and c['detail']=='98' for c in checks)
    assert r.bytes_transferred < 131072


def test_oversized_roi_and_external_link():
    with h5py.File(io.BytesIO(synthetic()),'r+') as h5:
        with pytest.raises(ValueError,match='oversized'):
            inspect_metadata(h5,[-80.86,25.45,-80.75,25.56],1)
        h5['external'] = h5py.ExternalLink('must-not-open.h5','/data')
        with pytest.raises(ValueError,match='indirect'): dataset(h5,'/external')


def test_shifted_grids_do_not_count_common_pixels():
    a = {'crs':'EPSG:32617','roiShape':[2,2],'spacing':[20,-20],'roiFirstCenter':[0,0]}
    b = {**a,'roiFirstCenter':[10,0]}
    results = pair_checks([{'hdf5':{'frequencies':{'frequencyA':a}}},
                           {'hdf5':{'frequencies':{'frequencyA':b}}}],[{},{}])
    assert results[0]['status'] == 'FAIL'
    assert results[1]['status'] == 'UNVERIFIED'


def test_missing_actual_metadata_never_passes():
    assert file_checks({})[0]['status'] == 'UNVERIFIED'


def test_truncated_response_counts_consumed_bytes():
    class Truncated(Session):
        def get(self,*args,**kwargs):
            response = super().get(*args,**kwargs)
            response.raw = io.BytesIO(b'ab')
            return response
    with reader(Truncated(b'abcdefgh')) as r:
        with pytest.raises(AccessError,match='Truncated'): r.read(4)
        assert r.bytes_transferred == 2


CDN = 'https://d1mv8zhcvry6x4.cloudfront.net/s3-' + 'a'*32 + '/NISAR_L2_GCOV_PROVISIONAL_V1/test.h5?Signature=secret'


def redirect_reader(monkeypatch, destination=CDN, status=206, overrides=None):
    origin = Session(b'abcdefghijklmnopqrstuvwx')
    origin.status = 303
    origin.overrides = {'Location':destination}
    target = Session(origin.data)
    target.status = status
    target.overrides = overrides or {}
    r = reader(origin)
    prepared = []
    def send(request,**kwargs):
        prepared.append(request)
        assert kwargs['allow_redirects'] is False
        assert kwargs['proxies'] == {}
        assert kwargs['verify'] is True
        return target.get(request.url,headers=request.headers,**kwargs)
    monkeypatch.setattr(r.redirect_session,'send',send)
    return r,origin,target,prepared


def test_allowed_redirect_no_credentials_and_budget(monkeypatch):
    r,origin,target,prepared = redirect_reader(monkeypatch)
    with r:
        assert r.read(8) == b'abcdefgh'
        assert len(origin.calls) == 1  # Signed URL reused only in memory.
        assert len(target.calls) == 2
        assert origin.response.raw.tell() == 0
        assert r.audit()['verified206Responses'] == 2
        assert r.audit()['firstContentRange'] == 'bytes 0-3/24'
        assert 'secret' not in str(r.audit())
        for request in prepared:
            assert not {'authorization','cookie','proxy-authorization'} & {h.lower() for h in request.headers}
        r.read(8)
        with pytest.raises(AccessError,match='budget'): r.read(1)
        assert r.bytes_transferred == 16
    assert r._resolved_url is None


@pytest.mark.parametrize('destination',[
    CDN.replace('https:','http:'), CDN.replace('d1mv8zhcvry6x4.cloudfront.net','evil.test'),
    CDN.replace('d1mv8zhcvry6x4.cloudfront.net','other.cloudfront.net'),
    CDN.replace('test.h5','different.h5'), CDN.replace('https://','https://user:secret@'),
    CDN.replace('.net/','.net:444/'), CDN+'#secret', '',
    'https://urs.earthdata.nasa.gov/login?secret=hidden'])
def test_rejected_redirect_has_no_target_request(monkeypatch,destination):
    r,origin,target,prepared = redirect_reader(monkeypatch,destination)
    with r:
        with pytest.raises(AccessError,match='rejected'): r.read(1)
        assert not prepared
        assert r.bytes_transferred == 0
        assert 'secret' not in str(r.audit())


@pytest.mark.parametrize('status',[200,401,403])
def test_redirect_missing_range_or_auth(monkeypatch,status):
    r,origin,target,prepared = redirect_reader(monkeypatch,status=status)
    with r:
        with pytest.raises(AccessError): r.read(1)
        assert target.response.raw.tell() == 0
        assert r.bytes_transferred == 0
        assert not r.audit()['verified206Responses']


def test_redirect_wrong_content_range(monkeypatch):
    r,_,target,_ = redirect_reader(monkeypatch,overrides={'Content-Range':'bytes 0-3/999'})
    with r:
        with pytest.raises(AccessError,match='Content-Range'): r.read(1)
        assert target.response.raw.tell() == 0


def test_redirect_loop_bounded(monkeypatch):
    r,_,_,prepared = redirect_reader(monkeypatch,status=303,overrides={'Location':CDN})
    with r:
        with pytest.raises(AccessError,match='limit'): r.read(1)
        assert len(prepared) == 3
        assert r.bytes_transferred == 0


def test_hard_upper_limits():
    with pytest.raises(ValueError): RangeReader(None,URL,100,max_bytes=65*1024**2)
    with pytest.raises(ValueError): RangeReader(None,URL,100,cache_bytes=9*1024**2)


def test_requests_transport_does_not_consume_redirect_or_forward_secrets(monkeypatch):
    import requests
    from requests.adapters import BaseAdapter
    origin = requests.Session()
    origin.headers['Authorization'] = 'Bearer private'
    origin.cookies.set('edl','private',domain='nisar.asf.earthdatacloud.nasa.gov')
    sent = []
    reads = []
    class TrackedBody(io.BytesIO):
        def read(self,*args,**kwargs):
            reads.append(len(sent))
            return super().read(*args,**kwargs)
    class Adapter(BaseAdapter):
        def send(self,request,**kwargs):
            sent.append(request)
            response = requests.Response()
            response.request, response.url = request, request.url
            response.raw = TrackedBody(b'abcd')
            response.status_code = 303 if len(sent)==1 else 206
            response.headers.update({'Location':CDN} if len(sent)==1 else {'Content-Range':'bytes 0-3/24'})
            return response
        def close(self): pass
    with RangeReader(origin,URL,24,block_size=4,cache_bytes=8,max_bytes=16) as r:
        r.redirect_session.mount('https://',Adapter())
        # Even target-session cookies/auth must not enter the bare prepared request.
        r.redirect_session.cookies.set('unwanted','private')
        r.redirect_session.auth = ('private','private')
        assert r.read(4)==b'abcd'
        assert sent[0].headers['Authorization']=='Bearer private'
        assert 'Cookie' in sent[0].headers
        assert 'Authorization' not in sent[1].headers and 'Cookie' not in sent[1].headers
        assert 'private' not in str(r.audit())
        assert 1 not in reads  # Requests must never consume the 303 body.


def test_required_auth_failure_does_not_request_products(monkeypatch):
    from pipeline import check_compatibility as module
    def reject(*args): raise RuntimeError('private-token')
    monkeypatch.setattr(module,'load_asf',lambda:None)
    monkeypatch.setattr(module,'authenticated_session',reject)
    report = module.run({'roiWgs84':[-80.82,25.48,-80.78,25.52]},require_auth=True)
    assert report['products'] == []
    assert report['checks'][0]['status'] == 'UNVERIFIED'
    assert 'private-token' not in str(report)


def test_redirect_diagnostics_identify_path_rejection_without_secrets(monkeypatch):
    from pipeline.sources import redirect_diagnostics
    target = CDN.replace('/s3-' + 'a'*32 + '/', '/different-origin/')
    diagnostics = redirect_diagnostics(target,URL)
    assert all(isinstance(v,bool) for v in diagnostics.values())
    assert diagnostics['hostAllowlisted'] and diagnostics['https']
    assert diagnostics['productKeySuffixMatches']
    assert not diagnostics['strictProductPathMatches']
    assert not diagnostics['mappedOriginPrefixMatches']
    r,_,_,prepared = redirect_reader(monkeypatch,target)
    with r:
        with pytest.raises(AccessError): r.read(1)
        assert r.audit()['redirects'][0]['validation'] == diagnostics
        assert not prepared
        assert 'secret' not in str(r.audit()) and 'different-origin' not in str(r.audit())


@pytest.mark.parametrize('prefix',['NISAR/','sds-n-cumulus-prod-nisar-products/','archive/NISAR/'])
def test_redirect_preserves_product_key_with_intermediate_segments(monkeypatch,prefix):
    target = CDN.replace('/NISAR_L2_', '/' + prefix + 'NISAR_L2_',1)
    r,_,_,prepared = redirect_reader(monkeypatch,target)
    with r:
        assert r.read(4) == b'abcd'
        assert r.audit()['redirects'][0]['allowed']
        assert r.audit()['verified206Responses'] == 1
        assert 'Authorization' not in prepared[0].headers
        assert 'Cookie' not in prepared[0].headers


@pytest.mark.parametrize('prefix',['../','./','archive/../','%2e%2e/','archive%2Fprivate/','archive\\private/','/'])
def test_redirect_rejects_unsafe_intermediate_segments(monkeypatch,prefix):
    target = CDN.replace('/NISAR_L2_', '/' + prefix + 'NISAR_L2_',1)
    r,_,_,prepared = redirect_reader(monkeypatch,target)
    with r:
        with pytest.raises(AccessError): r.read(1)
        assert not prepared
        assert r.bytes_transferred == 0
