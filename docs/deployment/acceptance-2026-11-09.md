# W05 smart accounts acceptance evidence

Evidence index prepared 2026-11-09. Repository inspected at `29853f33ce28e8f0b6210704eedbb75184235788`. Individual reports and deployment manifests identify the source that was tested or deployed.

| Gate | Result |
| --- | --- |
| Local engineering | PASS within the tested scope |
| Security self-review | Recorded in [AI-Assisted Self-Assessment](../audit/review-2026-11-08.md) |
| Independent third-party audit | NOT RUN |
| Owner learning mastery | NOT RUN |

## Local verification

The shared-signer source checkpoint records PASS for format, typecheck, eleven TypeScript tests, 41 contract tests, forced compiler build and production frontend build. Earlier local bundler integration and browser runs have separate evidence. [Current checkpoint](../../evidence/checkpoint.json), [local integration](../../evidence/review-2026-11-08/w05-service-integration.log) and [browser log](../../evidence/review-2026-11-08/w05-browser.log).

## Public testnet

Ethereum Sepolia release BLOCKED. The current prepared plan is unsigned, with a readable RPC and an unavailable required pending trace. The shared deployer snapshot had 0.098339098586003849 Sepolia ETH against a 0.5352 ETH deployment and deposit ceiling. Public creation and UserOperation receipts for W05 are NOT RUN. [Release and budget policy](sepolia-release.md).

## Remaining scope

Local passkey evidence used a virtual authenticator. Public hosting, public service acceptance and physical authenticator custody remain outside the verified scope.
