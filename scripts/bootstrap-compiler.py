"""Install a checksum-pinned compiler inside this checkout; never touch global toolchains."""
from pathlib import Path
import urllib.request, hashlib, json
root=Path(__file__).resolve().parents[1]
build={'path':'solc-linux-amd64-v0.8.38+commit.1835d247','version':'0.8.38','sha256':'65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243'}
directory=root/'.toolchain';directory.mkdir(exist_ok=True)
compiler=directory/'solc-0.8.38'
if not compiler.exists():
    payload=urllib.request.urlopen('https://raw.githubusercontent.com/ethereum/solc-bin/gh-pages/linux-amd64/'+build['path'],timeout=120).read()
    if hashlib.sha256(payload).hexdigest()!=build['sha256']:raise RuntimeError('Compiler checksum mismatch')
    compiler.write_bytes(payload);compiler.chmod(0o755)
if hashlib.sha256(compiler.read_bytes()).hexdigest()!=build['sha256']:raise RuntimeError('Installed compiler checksum mismatch; preserve it for inspection')
print('Verified',build['version'],build['sha256'])
