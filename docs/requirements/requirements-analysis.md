# W05 Project Specification / SRS

Source: exact user Master Prompt V5, SHA256 3843969E11079DCC1A3C0943CBE3958A3C662BA6E9F759B2EA789F1F9A3265F4.

## Positioning and scope
Programmable smart accounts for SaaS sponsorship, enterprise approvals, games and passkey onboarding. Business value extremely high; foundational value high, technical barrier high. No industry certification level was specified (N/A). Intended portfolio competencies: Wallet Engineer, AA Engineer and Web3 Full-stack Engineer. No Solana, bridge, tokenomics or indexer requirement; these are N/A. Mainnet is optional and not authorized.

The functional scope includes deterministic account deployment, ERC-1271, single and atomic batch calls, gas sponsorship; passkeys, revocable session keys, target/selector/value limits, delayed guardian recovery, threshold approval, paymaster quota and hostile-operation simulation. Frontend, SDK, service, operational documentation, reproducibility and source teaching are mandatory. Runtime truth is chain receipt/events, never a successful redirect or pending RPC response.

## Protocol and version selection
Pin account-abstraction 0.8.0 (PackedUserOperation), OpenZeppelin 5.5.0 (WebAuthn/P256/ECDSA), Solidity 0.8.38 with Cancun target. Verify actual installed source and dependency hashes before acceptance. v0.6 UserOperation ABI must never be mixed with v0.8 packed fields. v0.8 EntryPoint uses EIP-712; SDK hashes must be compared with deployed getUserOpHash. ERC-1271 is read-only and returns 0x1626ba7e on success. This does not itself supply nonce or domain protection for arbitrary consumer messages: the account wraps message hashes in an account/chain/epoch domain.

Official sources consulted 2026-11-02:
- https://eips.ethereum.org/EIPS/eip-4337
- https://eips.ethereum.org/EIPS/eip-1271
- https://github.com/eth-infinitism/account-abstraction/tree/releases/v0.8
- https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.5.0/contracts/utils/cryptography/WebAuthn.sol

The original topic's short flow is conceptual, not the precise validation/settlement state machine. Validation precedes execution; execution failure can still consume gas and nonce. Atomicity concerns target state in one batch, not reversal of gas charges. Public mempool ERC-7562 compliance is a separate gate: a local trusted/allowlisted bundler is not a permissionless production bundler. Passkey assertion verification is not registration attestation or proof of recovery security. v5.5 WebAuthn intentionally omits origin/rpId validation; this application must bind RP ID and expected client data instead of inheriting that omission silently.

## Constraints
Ubuntu-24.04 Linux-native source/build/test; inspect existing state first. No real secrets in repository or logs. No real funds/default wallet. No public broadcast or publication without specific authorization. Public-testnet gate BLOCKED pending authorization and disposable funded credentials. Never fabricate audit findings or chain evidence. Self-assessment is not independent audit. Learning materials and demonstrated user mastery are separately assessed.

## Compiler security review, 2026-11-02
Initial local builds used the preinstalled 0.8.31. The official Solidity known-bugs registry identifies SOL-2026-7 as affecting optimized IR generation from 0.8.19 and fixed in 0.8.38. Because this project requires via-IR, asserting that generated code cannot trigger the issue is inappropriate. Final builds therefore pin project-local solc 0.8.38; old 0.8.31 logs are historical and cannot serve as final acceptance. The official solc-bin SHA256 is 65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243. No global compiler installation was changed. `evidence/solc-build.json` and `evidence/compiler-known-bugs.json` record the upstream data.

Sources: https://github.com/ethereum/solidity/blob/develop/docs/bugs.json and https://github.com/ethereum/solc-bin/blob/gh-pages/linux-amd64/list.json . This is a toolchain exposure assessment, not a fabricated application exploit.
