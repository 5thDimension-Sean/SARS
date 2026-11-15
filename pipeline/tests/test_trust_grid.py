"""Tests for the trust-layer grid exporter. Synthetic arrays only; never NASA data.

Runs with the standard library: python -m unittest pipeline.tests.test_trust_grid
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from pipeline.trust_grid import NODATA, decode_difference, encode_difference, write_difference_grids


class EncodeDifferenceTests(unittest.TestCase):
    def test_round_trip_within_quantization_and_nan_becomes_nodata(self):
        diff = np.array([[0.0, 1.234, -2.5], [np.nan, 6.0, -0.004]])
        raw = np.frombuffer(encode_difference(diff), dtype='<i2').reshape(diff.shape)
        self.assertEqual(raw[1, 0], NODATA)
        back = decode_difference(encode_difference(diff), diff.shape)
        self.assertTrue(np.isnan(back[1, 0]))
        valid = np.isfinite(diff)
        self.assertLessEqual(np.max(np.abs(back[valid] - diff[valid])), 0.005 + 1e-9)

    def test_infinite_values_are_masked_not_clipped(self):
        raw = np.frombuffer(encode_difference(np.array([[np.inf, -np.inf, 1.0]])), dtype='<i2')
        self.assertEqual(list(raw), [NODATA, NODATA, 100])

    def test_unrepresentable_value_raises_instead_of_clipping(self):
        with self.assertRaises(ValueError):
            encode_difference(np.array([[400.0]]))

    def test_rejects_empty_and_non_2d_input(self):
        with self.assertRaises(ValueError):
            encode_difference(np.array([1.0, 2.0]))
        with self.assertRaises(ValueError):
            encode_difference(np.empty((0, 3)))

    def test_decode_rejects_wrong_length(self):
        with self.assertRaises(ValueError):
            decode_difference(b'\x00\x00\x01\x00', (2, 2))

    def test_byte_order_is_little_endian(self):
        self.assertEqual(encode_difference(np.array([[2.56]])), (256).to_bytes(2, 'little', signed=True))


class WriteGridTests(unittest.TestCase):
    def _write(self, diffs):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = write_difference_grids(
            Path(tmp.name), diffs, study='Synthetic', dates=['2000-01-01', '2000-01-13'],
            granules=['G1-TEST', 'G2-TEST'], crs='EPSG:32615', pixel_spacing_m=[10.0, -10.0],
            first_pixel_center=[0.0, 0.0], warning='EXPLORATORY ONLY')
        return Path(tmp.name), json.loads(path.read_text(encoding='utf-8'))

    def test_sidecar_records_shape_scale_nodata_and_exploratory_status(self):
        directory, meta = self._write({'HH': np.zeros((3, 4)), 'HV': np.ones((3, 4))})
        self.assertEqual(meta['shape'], [3, 4])
        self.assertEqual(meta['scaleDb'], 0.01)
        self.assertEqual(meta['nodata'], NODATA)
        self.assertEqual(meta['scientificStatus'], 'EXPLORATORY_NOT_CLEARED')
        self.assertEqual(meta['files'], {'HH': 'HH_difference_grid.i16', 'HV': 'HV_difference_grid.i16'})
        self.assertEqual((directory / meta['files']['HV']).stat().st_size, 3 * 4 * 2)

    def test_mismatched_polarization_shapes_are_rejected(self):
        with self.assertRaises(ValueError):
            self._write({'HH': np.zeros((3, 4)), 'HV': np.zeros((4, 3))})


if __name__ == '__main__':
    unittest.main()
