# Evidence index and freshness

## Current local acceptance
- check-final.txt + checkpoint.json: source-bound format, strict types, TypeScript tests, Foundry33 tests/fuzz/invariants, forced fixed-compiler build and Next production build.
- coverage-final038.txt / final-lcov.info: all33 tests pass with instrumentation; SmartAccount93.40% lines,100% functions.
- service-integration-final.txt:10 tests on the actual deployed local EntryPoint, including viem JSON-RPC and client disconnect.
- browser/acceptance.json/.log and screenshots:10 browser checkpoints, virtual CTAP2, no pageerror.
- deployment-verification.json / verify-checked-final.txt / ../deployments/local.json: local creation calldata, compiler, runtime hashes, receipt, immutable EP and deposit.
- service-restart.json / rpc-failure-recovery.json / cold-restore.json: actual failure and recovery probes, with explicit scope.
- clean-reproduction.json + repro-install.txt/repro-complete-gate.txt: fresh checkout/node_modules on the same host; cached packages/compiler, not CI or a clean OS.
- slither-final038.json/.txt + ../docs/audit/static-triage.md:25 alerts reviewed, not zero-alert certification.
- mutation-summary.json / mutation-*.txt:3 killed test-only mutants on0.8.38.
- npm-audit-final.json, gitleaks.json/.txt: dependency advisories and committed-secret scan at the recorded time.
- security-failure-traces-and-gas.txt: actual negative traces plus gas report for the selected cases, not a fixed public transaction price.

## Historical diagnostic evidence
Files namedfirst, before, initial, olderforge/coverage/build logs, earlier deployment manifests and olderaudit reports are retained to explain failures and fixes. They do not override the current acceptance above. In particular:0.8.31 logs are historical; initialcounterfactual coverage failed due instrumentation gas budget and was rerun successfully; initialbrowser selectors were too strict about decorative icons and were corrected; F-01 is the real pre-fix recovery failure. No failed historical log is silently labeled passed.
