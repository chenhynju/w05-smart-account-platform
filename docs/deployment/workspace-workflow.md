# WSL-first portfolio workflow

Updated: 2026-11-08 Asia/Shanghai. User-authorized source policy.

- All development, compilation, tests, Git commits and pushes originate in the WSL Ubuntu-24.04 Linux working trees under `/home/chenhy/workspace/web3-portfolio`.
- Windows `D:/appspace/web3prepare` contains independent review mirrors. Do not develop, commit, or push from a Windows mirror. Local Git hooks reject accidental commits/pushes there.
- Direction is WSL -> GitHub -> Windows. Before synchronization, preserve differing Windows files and remote history. On conflict WSL content wins; never discard unsaved work, use `reset --hard`, or blindly force-push.
- Fetch remote changes before development and publication. Preserve a named remote backup ref before resolving any divergence. WSL authority is a workflow rule, not a guarantee against unobserved external writers.
- Publish only the tested source, record its Git SHA and source hashes, then verify remote HEAD and mirror hashes. Uncommitted changes must be reviewed, not silently bundled into an unrelated commit.
- Keep secrets, `.env`, runtime keys/state, deployment keystores, node_modules and build caches out of mirrors and public archives. Public deployment metadata and reproducibility evidence remain versioned.
- Public testnet deployments, GitHub archiving and Vercel are authorized by the current conversation. No mainnet, real assets or new paid resources. Final Vercel/Cloudflare configuration is consolidated at the end per the user's steering.
- Local repository paths may change while existing GitHub repository URLs remain stable. Preserve old Linux paths as compatibility symlinks until scripts/services have migrated.

## Canonical project names

| ID | Project directory | Previous identity |
|---|---|---|
| D01 | d01-amm-dex | W02 / b2-amm |
| D02 | d02-isolated-lending | W01 / b2-lending |
| W05 | w05-smart-account-platform | smart-account-platform |
| W07 | w07-chain-observatory | unchanged |
| D11 | d11-rwa-tokenization-platform | W10 RWA, called W11 in the request |

D11 is the DeFi business-table RWA direction, not the former W11 Rollup topic. W05/W07 are infrastructure projects and retain their established IDs.
