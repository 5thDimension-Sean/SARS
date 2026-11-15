"""Integrity and scientific-status checks for imported official browse PNGs."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image


ROOT = Path(__file__).resolve().parents[1] / 'research' / 'hubbard-sossusvlei'
EXPECTED = {
    'G4344465497-ASF': ('Hubbard Glacier', '2026-10-04', 126563),
    'G4375612623-ASF': ('Hubbard Glacier', '2026-10-16', 127680),
    'G4352673999-ASF': ('Sossusvlei', '2026-10-07', 85095),
    'G4381600932-ASF': ('Sossusvlei', '2026-10-19', 85095),
}


def test_official_browse_assets_match_catalog_and_acquisition_identity():
    source = json.loads((ROOT / 'source-index.json').read_text(encoding='utf-8'))
    assert {a['conceptId'] for a in source['acquisitions']} == set(EXPECTED)
    paths = []
    for acquisition in source['acquisitions']:
        location, date, _ = EXPECTED[acquisition['conceptId']]
        assert acquisition['location'] == location
        assert acquisition['acquisitionStartUtc'][:10] == date
        assert date.replace('-', '') in acquisition['producerGranuleId']
        assert set(acquisition['browse']) == {'HH', 'HV'}
        for pol, file in acquisition['browse'].items():
            suffix = {'HH': 'HHHH', 'HV': 'HVHV'}[pol]
            name = acquisition['producerGranuleId'] + '_NATIVE_A_' + suffix + '.png'
            assert file['localPath'] == 'browse/' + name
            assert urlsplit(file['url']).hostname == 'nisar.asf.earthdatacloud.nasa.gov'
            assert urlsplit(file['url']).path.endswith('/' + name)
            path = ROOT / file['localPath']
            paths.append(path)
            data = path.read_bytes()
            assert len(data) == file['catalogBytes']
            assert file['catalogChecksum']['algorithm'] == 'MD5'
            assert hashlib.md5(data).hexdigest() == file['catalogChecksum']['value']
            assert hashlib.sha256(data).hexdigest() == file['localSha256']
            assert file['checksumVerified'] is True
            with Image.open(path) as image:
                assert image.format == 'PNG'
                assert image.size == (file['image']['width'], file['image']['height'])
                assert image.mode == file['image']['mode']
                image.verify()
            with Image.open(path) as image:
                image.load()
    assert len(paths) == len(set(paths)) == 8
    assert set((ROOT / 'browse').glob('*.png')) == set(paths)


def test_browse_integrity_does_not_clear_science_or_complete_roi_exports():
    source = json.loads((ROOT / 'source-index.json').read_text(encoding='utf-8'))
    assert source['status'] == 'BLOCKED'
    assert source['scientificClearance'] == 'EXPLORATORY_NOT_CLEARED'
    assert source['measurements'] is None
    exports = source['exportCompletion']
    assert exports['officialBrowsePngsVerified'] == 8
    assert exports['requiredRoiPngs'] == 12
    assert exports['generatedRoiPngs'] == exports['differenceImagesGenerated'] == 0
    assert any('official identification QA failures' in w for w in source['warnings'])
    for acquisition in source['acquisitions']:
        assert acquisition['status'] == 'BLOCKED'
        assert acquisition['scientificClearance'] == 'EXPLORATORY_NOT_CLEARED'
        assert acquisition['officialQaSummary']['retrieved'] is False
        assert acquisition['previousScreening']['reportedValidPixels'] == EXPECTED[acquisition['conceptId']][2]
        assert acquisition['previousScreening']['roiBoundsWgs84'] is None
