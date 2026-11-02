"""Bind a successful check.sh execution to exact tracked source bytes, not report filenames."""
from pathlib import Path
import subprocess,hashlib,json,sys,datetime
root=Path(__file__).resolve().parents[1]
paths=['contracts','apps','packages','services','scripts','tests','.github','foundry.toml','package.json','package-lock.json','tsconfig.json','.prettierignore']
names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--',*paths],cwd=root).split(b'\0')
digest=hashlib.sha256()
for raw in sorted(n for n in names if n):
    path=root/raw.decode();digest.update(raw+b'\0'+path.read_bytes()+b'\0')
value=digest.hexdigest();checkpoint=root/'evidence/checkpoint.json'
if '--digest' in sys.argv:
    print(value);raise SystemExit(0)
if '--record' in sys.argv:
    if '--expected' not in sys.argv or sys.argv[sys.argv.index('--expected')+1]!=value:raise RuntimeError('Source changed during checks; rerun the complete gate.')
    data={'sourceHash':value,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'checkedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':['format','strict typecheck','TypeScript unit','Foundry unit/fuzz/stateful invariants seed 0x4337','forced compiler build and size limits','Next production build'],'status':'PASS'}
    checkpoint.write_text(json.dumps(data,indent=2)+'\n');print('Recorded successful source checkpoint',value)
else:
    data=json.loads(checkpoint.read_text())
    if data.get('status')!='PASS' or data.get('sourceHash')!=value:raise RuntimeError('Checks do not match current source. Run scripts/check.sh again.')
    print('Verified successful source checkpoint',value)
