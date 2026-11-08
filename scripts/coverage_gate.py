#!/usr/bin/env python3
from pathlib import Path
import json
rows=[]
for record in Path('lcov.info').read_text().split('end_of_record'):
 values={k:v for line in record.splitlines() if ':' in line for k,v in [line.split(':',1)] if k in ['SF','LF','LH','BRF','BRH']}
 if values.get('SF','').startswith('contracts/'):rows.append(values)
passed=len(rows)==4 and all(int(r['BRF'])==0 or int(r['BRH'])*100>=int(r['BRF'])*90 for r in rows)
Path('evidence/coverage-current.json').write_text(json.dumps({'status':'PASS' if passed else 'FAIL','instrumentation':'forge coverage --ir-minimum; source-map limitations documented','files':rows},indent=2)+'\n')
print(json.dumps(rows));raise SystemExit(0 if passed else 1)
