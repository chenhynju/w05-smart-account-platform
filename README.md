# Smart Account Platform · W05

A working ERC-4337 v0.8 account workspace with immutable CREATE2 accounts, ERC-1271 signatures, atomic batches, gas sponsorship, scoped session keys, WebAuthn/P256 authorization, threshold owners and delayed guardian recovery.

**Evidence boundary:** the application currently runs on an isolated Anvil chain with a local allowlisted bundler. It is not a production wallet, independent security audit, permissionless public bundler certification, or proof of public-testnet deployment. The local signer UI uses disposable session-storage keys. Never use those keys for real assets. Physical authenticators and independent human custody are separate acceptance gates.

## Start here

- [Original requirements](docs/requirements/source-requirements.txt), [specification](docs/requirements/requirements-analysis.md), [traceability](docs/requirements/traceability.md).
- [Architecture and threats](docs/architecture/design.md).
- [Chinese protocol foundations](docs/learning/protocol-mechanics.zh-CN.md).
- [Source walkthrough index](docs/code-walkthrough/README.md).
- [Runbook](docs/deployment/local-runbook.md), [security assessment](docs/audit/final-report.md), [acceptance report](docs/testing/acceptance.md).

## Reproduce in WSL2 Ubuntu 24.04

Source, dependencies and builds belong in a Linux filesystem. The working checkout is `/home/chenhy/workspace/web3-portfolio/smart-account-platform`. Use VS Code Remote WSL. Requirements: Node 24.20.0, npm 11.x, Python 3.12, Foundry 1.8.1, and ordinary Linux curl/git. No Docker, database, global compiler replacement, real private key or production secret is required.

```bash
python3 scripts/bootstrap-compiler.py
npm ci --ignore-scripts --registry=https://registry.npmjs.org
bash scripts/check.sh
bash scripts/run-local.sh
```

The runner refuses occupied ports and preserves existing deployments/state. It starts Anvil on `127.0.0.1:18555`, the service on `127.0.0.1:4355` and the production web app on `http://localhost:3155`. Initial deployment creates fresh random disposable keys in `.runtime/keys.json` with mode 0600 and funds them only through Anvil's local RPC. Anvil has zero default accounts. No public network transaction is sent. Closing the runner stops only its children and preserves state.

For manual operation, start Anvil with the command in the runbook, run `npm run deploy:local` once, then `npm run service` and `npm run start` in separate terminals. An existing deployment makes the first-deployment command fail safely. `scripts/roll-local-stack.ts` deploys a new side-by-side local stack after source-bound checks; it does not withdraw from or destroy the previous stack.

## Verify

```bash
npm test
npm run test:integration             # real running local chain/service required
npx playwright install chromium     # Linux browser, if not already installed
npm run e2e                          # real running production web app required
npx tsx scripts/verify-local.ts
forge coverage --ir-minimum --report summary --report lcov
python3 scripts/mutation-check.py
```

Windows Chromium can also run `tests/e2e/browser.cjs` against the WSL application. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed browser and optionally `W05_E2E_OUTPUT_DIR` to the evidence directory. The browser test uses a virtual CTAP2 authenticator. It is genuine WebAuthn browser/cryptography/chain integration, but does not validate a physical device, biometric enrollment, or independent people holding keys.

## Version and security decisions

- Solidity **0.8.38**, Cancun, optimizer 200, via-IR; bootstrap verifies upstream SHA256. Initial 0.8.31 evidence is historical. SOL-2026-7 affects the older optimized IR toolchain and motivated the upgrade.
- `@account-abstraction/contracts` **0.8.0**; `@openzeppelin/contracts` **5.5.0**; exact application versions are in `package-lock.json`.
- The account disables inherited unscoped execution methods. All execution uses `executeOperation(nonce, epoch, actions)` with current authorization.
- Epoch changes intentionally invalidate other sessions/passkeys and queued operations. This favors revocation safety over independent policy updates.
- Paymaster quotas reserve worst-case wei before execution and do not refund the business quota after a failed or cheaper operation. Deposit and quota are different quantities.
- Session caps constrain native value and exact target/selector, not arbitrary token amounts or allowance consequences.
- The service offers a tested ERC-4337 JSON-RPC subset at `/bundler`. Estimation currently requires a valid signed local operation and returns conservative verified bounds. This is not an assertion of full bundler conformance, ERC-7562 compatibility, or replacement-mempool support.

## Project map

`contracts/` contains the account, factory, paymaster and local acceptance target. `packages/` holds ABI/packing/hash and WebAuthn helpers. `services/bundler.ts` owns enrollment, sponsorship, simulation, serialization and reconciliation. `apps/web/` is the Next/wagmi UI. `tests/` contains Solidity, stateful, TypeScript, API and browser checks. `deployments/` and `evidence/` retain public local evidence; `.runtime/` contains private state and must not be shared or committed.

Source teaching was anchored at commit `297be8d4c862ffcf99543f2a7e0f4edf6a8c5f58`. Later documentation-only commits do not change the taught source; check the source-map hashes when updating it. Learning materials are not proof that the learner has mastered the implementation.
