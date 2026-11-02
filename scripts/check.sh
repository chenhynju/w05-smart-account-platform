#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/bootstrap-compiler.py
npm run format:check
npm run typecheck
npm test
forge test --fuzz-seed 0x4337 -vv
forge build --sizes
npm run build
