# Requirements Traceability and Acceptance Matrix

All tests initially NOT RUN. Status changes require linked actual execution evidence.

|ID|Original requirement|Design/implementation work package|Required test/security evidence|Status|
|---|---|---|---|---|
|F01|Deploy deterministic smart account|factory/idempotent CREATE2|deployment/address|NOT RUN|
|F02|ERC-1271 domain-separated contract signatures|signature validator|valid/invalid/wrong chain/account|NOT RUN|
|F03|Single transaction execution|EntryPoint-only execute|authorization/value/revert|NOT RUN|
|F04|Atomic batch execution|bounded batch loop|rollback on later failure|NOT RUN|
|F05|Gas sponsorship|signed quota paymaster|deposit/expiry/invalid authorization|NOT RUN|
|F06|Passkey|P256/WebAuthn verifier and browser enrollment|UP/UV/RP/origin/challenge/key/revocation|NOT RUN|
|F07|Session key|epoch, expiry, target, selector, cumulative value|revoke/expiry/overspend/arbitrary calldata|NOT RUN|
|F08|Whitelist and limits|exact target/selector and value budget|bypass/self-call/multicall/reentry|NOT RUN|
|F09|Social recovery|guardian threshold and delay|duplicate/early/cancel/replaced policy|NOT RUN|
|F10|Multisig approvals|unique sorted signers and threshold|duplicate/wrong signer/threshold bypass|NOT RUN|
|F11|Paymaster quota|reserve worst-case gas before execution|revert gas drain/replay/over-quota|NOT RUN|
|F12|Malicious call simulation|real eth_call/estimate and allowlist|revert/timeout/bad signature|NOT RUN|
|S01|Replay, nonce and chain isolation|EntryPoint nonce plus domain|same op twice/nonce key/chain/EntryPoint|NOT RUN|
|S02|Permission revocation|authorization epoch and execution recheck|validated before revoke/queued old op|NOT RUN|
|I01|Full-stack lifecycle|Next/wagmi/viem/local service|browser→service→chain→receipt→UI|NOT RUN|
|I02|Infrastructure reliability|validation/submission/receipt states|idempotency/retry/restart/failure|NOT RUN|
|Q01|Tests/security review|unit/fuzz/invariant/integration/E2E/review|actual logs/seeds/gas/coverage|NOT RUN|
|D01|Local and public-testnet deployment|preflight and scripts|bytecode/events/permissions; public authorization|NOT RUN|
|L01|Design and source teaching|walkthrough per actual source and SHA|A-I teaching, exercises, knowledge matrix|NOT RUN|
|R01|Reproducible delivery|lockfiles/CI/install/English README|clean install/build/test; secrets scan|NOT RUN|
