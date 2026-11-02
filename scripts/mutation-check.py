"""Test-only mutants in preserved isolated folders; never modify application sources."""
from pathlib import Path
import subprocess, shutil, os, json, time
root=Path(__file__).resolve().parents[1]
solc=os.environ.get('FOUNDRY_SOLC',str(root/'.toolchain/solc-0.8.38'))
source=(root/'contracts/SmartAccount.sol').read_text()
mutants=[
 ('batch-atomicity','if (!ok) revert CallFailed(i, result);','if (!ok) { /* isolated test mutant: ignore failure */ }','testAtomicBatchRollbackAndGasNonceStillConsumed'),
 ('duplicate-owner','signer <= previous || !owners[signer]','!owners[signer]','testMultisigSortedUniqueThreshold'),
 ('session-accounting','s.remaining -= total;','s.remaining = s.remaining;','testTwoSessionOpsCannotOverspendOneBudget'),
]
report=[]
campaign=root/'.runtime/mutations'/str(int(time.time()));campaign.mkdir(parents=True)
for name,before,after,test in mutants:
 if source.count(before)!=1:raise RuntimeError('Mutation anchor ambiguous: '+name)
 dest=campaign/name;dest.mkdir()
 shutil.copytree(root/'contracts',dest/'contracts')
 shutil.copytree(root/'tests/contracts',dest/'tests/contracts')
 (dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
 shutil.copyfile(root/'foundry.toml',dest/'foundry.toml')
 (dest/'contracts/SmartAccount.sol').write_text(source.replace(before,after))
 result=subprocess.run(['forge','test','--use',solc,'--match-test',test,'-vv'],cwd=dest,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=240)
 log=root/f'evidence/mutation-{name}.txt';log.write_text(result.stdout)
 killed=result.returncode!=0 and '[FAIL' in result.stdout and 'Compiler run failed' not in result.stdout
 report.append({'mutant':name,'test':test,'killed':killed,'exitCode':result.returncode,'log':str(log.relative_to(root))})
 print(name, 'KILLED' if killed else 'NOT_KILLED',flush=True)
(root/'evidence/mutation-summary.json').write_text(json.dumps(report,indent=2)+'\n')
if not all(row['killed'] for row in report):raise SystemExit(1)
