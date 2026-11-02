# Local development and recovery runbook

## Environment and paths
Use Ubuntu-24.04 under WSL2. Keep the checkout in the Linux filesystem. This session's checkout is `/home/chenhy/workspace/web3-portfolio/smart-account-platform`. Node is installed under `/home/chenhy/.local/share/fnm/node-versions/v24.20.0/installation/bin`; Foundry under `/home/chenhy/.foundry/bin`. Add those explicit Linux paths for a non-login shell; never let a Windows node/npm accidentally compile this project.

For host-driven scripts, invoke `wsl.exe -d Ubuntu-24.04 -- /bin/bash --noprofile --norc` with a script file or stdin. Avoid nested PowerShell interpolation of Bash variables. Task-specific HTTPS proxy settings may be needed on this host; do not change the user's system proxy or global npm registry. The original npm mirror returned403; explicit `--registry=https://registry.npmjs.org` worked via the task's loopback CONNECT proxy. Proxy credentials are not needed or stored by this project.

## Build before starting
Run bootstrap-compiler.py, npm ci --ignore-scripts with the official registry, then scripts/check.sh. Solidity 0.8.38 is checksum pinned in the checkout. `forge build --force` is intentional: stale cached upstream EntryPoint artifacts were detected by the compiler guard during development. Old0.8.31 logs do not count as final verification.

## Manual terminals
1. `anvil --silent --accounts 0 --host 127.0.0.1 --port 18555 --chain-id 31337 --hardfork cancun --state .runtime/anvil-state.json --state-interval 30`
2. On first use only, `npm run deploy:local`. This creates disposable keys0600 and refuses to overwrite an existing key file/deployment. Subsequent use: verify the existing manifest; do not rerun deployment as a substitute for starting the chain state.
3. `npm run service` and `npm run start`. Open http://localhost:3155 . Use localhost for WebAuthn RP compatibility.

The combined scripts/run-local.sh performs the same startup and refuses occupied ports. Inspect an existing listener before deciding whether it belongs to this workspace. Never kill other projects' processes.

## Local workflow
Create an account → prepare a Counter call → review full operation → approve owner → simulate → submit → verify successful UserOperation event and Counter state. Configure a session key, sign a permitted call, revoke, and prove a later signature is rejected. Register a passkey and submit an actual assertion. Switch to2-of-2 only after preserving both disposable local keys; require two distinct approval actions. Guardian recovery waits two days on chain; never bypass its delay in product code. Tests may use time travel only against the explicit isolated Anvil chain.

Custom atomic calls accept JSON objects with target/address, value as decimal wei, and ABI data. Use SDK encodeFunctionData for setGuardians/setOwners and ID-based recovery methods. This is an advanced payload interface: inspect targets and selectors before signing. Session limits apply only to native value, not token approvals or arbitrary router consequences.

## Persistence and restart
Preserve `.runtime/keys.json`, `anvil-state.json`, deployment.json and `service-state-<EntryPoint>.json` together. The service writes signed transaction bytes and a known transaction hash before broadcast, fsyncs and atomically renames records. Restarting the process must read the sameEntryPoint-specific store. Reconcile pending operations using actualreceipt/events; re-broadcast only identical signed bytes. Do not “retry” by making a different operation with an assumed nextnonce.

Graceful Anvil shutdown preserves its state. A restored service store against a different/emptychain must not be treated as valid business state. Verify chain ID, codehashes, deployed addresses, nonce, balances and receipts. Back up private runtime state into a private location with restrictive permissions; the publicsource archive intentionally excludes it. This is a local persistence design, not replicated production disaster recovery.

## Error handling
- HTTP400: malformed input, unsupportedmethod or invalid account/signature/operation. Inspect actualEntryPoint error.
- HTTP403: untrustedOrigin.
- HTTP429: localrate limit; wait the window instead of unboundedretry.
- HTTP503: service/RPCtransport unavailable; preserve the draft and reconcile previoussubmissions after recovery.
- `execution_failed`: includedoperation reverted; gas, nonce and worst-case sponsorquota may still be consumed.
- `submitted/unknown`: do not display businesssuccess. Query byuserOpHash and transactionhash.

The service's240requests/minute,10account enrollment cap and finitegas sponsorship are localabuse limits, not SaaSbilling/identity. Do not expose this service publicly as-is.

## Change and rollback
Freeze source, run checks, inspect findings, then use roll-local-stack.ts for a newside-by-side localstack. It preservesoldcontracts, deposits, manifests, keys and service stores. Restart the service against thenewmanifest. To inspect an oldstack, select its archived manifest in a separate controlledrun; do not overwrite data or silentlymoveoldaccounts to a differentEntryPoint. No rollback can reverse a publicchaintransaction; publicdeployment is a separateauthorizedstep.

## Public network gate
No publicnetwork transaction or remotepublication is authorized by the schedulingrequest. Mainnet requiresseparateexplicitapproval. CurrentSDK/service/browser are intentionallyrestricted tochain31337. Publictestnetrollout still needs reviewednetworkconfiguration, disposablefundedcredentials, a fee/sponsorbudget, compatiblebundler/Paymastermempoolpolicy, adaptedRPC/serviceconfiguration, fullpublicclientE2E and sourceverification. Record these asBLOCKED/NOT RUN ratherthan inventinghashes. The repo doesnot contain a secretlyenabledpublicbroadcastswitch.
