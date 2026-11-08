#!/usr/bin/env python3
"""Retain raw warnings and require the reviewed exact source/semantic set."""
from pathlib import Path
import subprocess,json,hashlib,datetime
root=Path(__file__).resolve().parents[1];out=root/'evidence';out.mkdir(exist_ok=True)
report=out/('slither-gate-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
subprocess.run(['slither','.','--filter-paths','node_modules/|tests/','--json',str(report)],cwd=root)
actual=json.loads(report.read_text());assert actual['success'],actual.get('error')
expected=json.loads((root/'docs/audit/static-review-baseline.json').read_text())
for rel,h in expected['sourceHashes'].items():assert hashlib.sha256((root/rel).read_bytes()).hexdigest()==h,'Source changed: review required '+rel
fingerprints=sorted(x['check']+'|'+x['impact']+'|'+x['description'] for x in actual['results']['detectors'])
assert fingerprints==expected['fingerprints'],'Static findings changed: review required'
print('PASS reviewed-warning gate; raw alerts retained, not zero findings')
