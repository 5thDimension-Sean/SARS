"""Read the small official QA CSV within the SAME product's transfer allowance."""
import csv
import hashlib
import io

from .sources import RangeReader


def inspect_qa_summary(session, source, remaining_bytes):
    result = {'status':'UNVERIFIED','detail':'Official QA summary unavailable or outside remaining product budget.',
              'scientificReview':'UNVERIFIED; successful retrieval does not mean official QA passed.'}
    if not source:
        return result
    size = int(source['file']['SizeInBytes'])
    if not 0 < size <= 256*1024 or remaining_bytes < size:
        return result
    reader = RangeReader(session,source['url'],size,block_size=min(size,4096),
                         max_bytes=remaining_bytes)
    try:
        with reader:
            body = reader.read(size)
        text = body.decode('utf-8-sig')
        if '<html' in text.lower() or '<!doctype' in text.lower():
            raise ValueError('Not CSV')
        rows = list(csv.reader(io.StringIO(text)))
        if not rows or len(rows)>1000 or any(len(row)>32 or any(len(cell)>4096 for cell in row) for row in rows):
            raise ValueError('Unexpected QA summary layout')
        result.update(status='PASS',detail='Complete official QA CSV read; rows require scientific interpretation.',
                      source=source,sha256=hashlib.sha256(body).hexdigest(),rows=rows)
    except Exception:
        result['detail'] = 'QA read incomplete or unsupported CSV; diagnostics withheld.'
    finally:
        result['transfer'] = reader.audit()
        reader.close()
    return result
