"""Synthetic HDF5 fixtures for strict saved/live metadata comparisons."""
import io
import json

import h5py
import pytest

from pipeline.check_compatibility import describe


def description(*, shape=(4, 6), chunks=(2, 3), dtype='f4',
                compression='gzip', units='1'):
    with h5py.File(io.BytesIO(), 'w') as h5:
        ds = h5.create_dataset('power', shape=shape, chunks=chunks,
                               dtype=dtype, compression=compression)
        ds.attrs['units'] = units
        return describe(ds)


def test_chunked_metadata_survives_json_round_trip_exactly():
    live = description()
    saved = json.loads(json.dumps(live))
    assert live['chunks'] == [2, 3]
    assert live == saved


def test_contiguous_storage_remains_distinct_from_chunked_storage():
    live = description(chunks=None, compression=None)
    assert live['chunks'] is None
    assert live == json.loads(json.dumps(live))
    assert live != description(compression=None)


@pytest.mark.parametrize('change', [
    {'chunks': (1, 3)},
    {'shape': (5, 6)},
    {'dtype': 'f8'},
    {'compression': None},
    {'units': 'dB'},
])
def test_real_metadata_changes_still_fail_exact_comparison(change):
    saved = json.loads(json.dumps(description()))
    assert description(**change) != saved
