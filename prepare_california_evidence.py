"""Package previously computed, real NISAR California Plaskett Fire analysis for the static website.

Run from SARS repo root: py prepare_sar_waltz_evidence.py
Requires no credentials, network access, or third-party packages.
Does not compute environmental-change maps or modify the existing manifest.json.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / 'pipeline/output/california-analysis'
OUT = ROOT / 'frontend/public/data/california-evidence'
STUDY_ID = {'2026-08-22': 'G4288641488-ASF', '2026-09-15': 'G4314277037-ASF'}


def main():
    src = INPUT / 'descriptive-statistics.json'
    manifest = json.loads(src.read_text(encoding='utf-8'))
    acquisitions = manifest['acquisitions']
    by_date = {a['date']: a for a in acquisitions}
    if set(by_date) != set(STUDY_ID) or len(acquisitions) != 2:
        raise ValueError('Unexpected dates/acquisition count; stop and review source data')
    if manifest.get('scientificClearance') != 'NOT CLEARED FOR QUANTITATIVE ANALYSIS':
        raise ValueError('Unexpected QA declaration; stop and review')
    for date, concept in STUDY_ID.items():
        if by_date[date]['conceptId'] != concept:
            raise ValueError('NASA source granule mismatch; stop and review')

    result = {
        'schemaVersion': 'sar-waltz-evidence-1.0',
        'title': 'California Plaskett Fire NISAR backscatter evidence',
        'studyArea': 'California Plaskett Fire study area',
        'provenance': 'NASA NISAR Level-2 GCOV via ASF DAAC; local scientific export',
        'measurement': 'gamma0 backscatter (dB); 10 log10 of screened linear power',
        'measurementType': 'per-acquisition descriptive statistics',
        'scientificClearance': 'NOT CLEARED FOR QUANTITATIVE ANALYSIS',
        'quality': {
            'identificationGroup': 'FAIL on both official NASA QA summaries; specific identification failure unexplained',
            'frequencyAHHAndHVValidity': 'PASS on both official NASA QA summaries for Frequency A HH/HV invalid-pixel threshold checks; decimated rasters only',
            'gridAlignment': 'PASS for selected Frequency A ROI: EPSG:32610, 10 m, 450 by 369',
            'radiometricArtifactsAndNoise': 'UNVERIFIED; RFI, noise and possible banding need review',
        },
        'limitations': [
            'This is exploratory visualization of real NASA observations; not a validated wildfire damage finding.',
            'Differences between regional means or medians are not paired-pixel changes.',
            'Per-date masks may not select exactly the same pixels even when counts are equal.',
            'Displayed histogram bins exclude values outside their fixed display ranges.',
            'Official identification-group checks failed for both California products; radiometric artifact review remains incomplete.',
        ],
        'dates': ['2026-08-22', '2026-09-15'],
        'polarizations': {},
    }

    for pol in ('HH', 'HV'):
        observations = []
        expected_columns = ['bin_low_db','bin_high_db','sep30_count','oct12_count']
        with (INPUT / f'{pol}_histograms.csv').open(newline='',encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if reader.fieldnames != expected_columns:
                raise ValueError(f'{pol} histogram columns differ from expected schema')
            bins = [{
                'lowDb': float(row['bin_low_db']), 'highDb':float(row['bin_high_db']),
                'firstDateCount':int(row['sep30_count']), 'secondDateCount':int(row['oct12_count']),
            } for row in reader]
        if len(bins) != 48:
            raise ValueError(f'Unexpected histogram bin count for {pol}: {len(bins)}')
        for date in result['dates']:
            source = by_date[date]['images'][pol]
            stats = source['descriptiveStatistics']
            if stats['screenedPixels'] != 166050:
                raise ValueError(f'Unexpected screened-pixel count for {date} {pol}')
            observations.append({
                'date':date, 'granuleId':by_date[date]['conceptId'],
                'count':stats['screenedPixels'],
                'meanDb':stats['meanDb'], 'medianDb':stats['medianDb'],
                'stdDb':stats['stdDb'], 'p05Db':stats['p05Db'], 'p95Db':stats['p95Db'],
                'outsideDisplayRange':stats['histogram']['outsideDisplayRange'],
            })
            # Verify CSV counts match the statistical histogram.
            key = 'firstDateCount' if date == '2026-08-22' else 'secondDateCount'
            if sum(b[key] for b in bins) != sum(stats['histogram']['counts']):
                raise ValueError(f'Histogram CSV does not match statistics for {date} {pol}')
        before, after = observations
        result['polarizations'][pol] = {
            'observations': observations,
            'differenceOfRegionalMeansDb': round(after['meanDb'] - before['meanDb'], 5),
            'differenceOfRegionalMediansDb': round(after['medianDb'] - before['medianDb'], 5),
            'differenceInterpretation': 'Difference of separate regional summary statistics; not paired per-pixel change',
            'histogramBinCountFieldByDate': {'2026-08-22':'firstDateCount', '2026-09-15':'secondDateCount'},
            'histogramBins': bins,
            'histogramImage': f'{pol}_histogram_comparison.png',
        }

    required_images = [INPUT / f'{pol}_histogram_comparison.png' for pol in ('HH','HV')]
    for path in required_images:
        if not path.is_file() or path.stat().st_size == 0:
            raise FileNotFoundError(f'Missing/empty chart: {path}; regenerate the histogram PNG first')

    OUT.mkdir(parents=True,exist_ok=True)
    for path in required_images:
        shutil.copy2(path, OUT/path.name)
    (OUT/'evidence.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print('Created:', OUT/'evidence.json')
    for path in required_images:
        print('Copied:', OUT/path.name)
    print('Scientific status: NOT CLEARED FOR QUANTITATIVE ANALYSIS')
    print('No NASA credentials or original scientific HDF5 files were copied.')

if __name__ == '__main__':
    main()
