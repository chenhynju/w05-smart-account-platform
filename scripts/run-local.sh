#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for port in 18555 4355 3155; do
  if ss -ltnH "sport = :$port" | grep -q .; then
    echo "Port $port is already occupied. Inspect the existing workspace; this script will not stop it." >&2
    exit 1
  fi
done
mkdir -p .runtime/logs
chmod 700 .runtime
children=()
finish() { for pid in "${children[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done; wait || true; }
trap finish EXIT INT TERM
anvil --silent --accounts 0 --host 127.0.0.1 --port 18555 --chain-id 31337 --hardfork cancun --state .runtime/anvil-state.json --state-interval 30 > .runtime/logs/anvil.log 2>&1 &
children+=("$!")
for attempt in {1..40}; do if curl -fsS -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' http://127.0.0.1:18555 >/dev/null; then break; fi; sleep 0.5; done
if [[ ! -f .runtime/deployment.json ]]; then npm run deploy:local; else npx tsx scripts/verify-local.ts; fi
npm run service > .runtime/logs/service.log 2>&1 &
children+=("$!")
for attempt in {1..40}; do if curl -fsS http://127.0.0.1:4355/health >/dev/null; then break; fi; sleep 0.5; done
npm run start > .runtime/logs/web.log 2>&1 &
children+=("$!")
echo 'Local account workspace: http://localhost:3155 . Ctrl+C stops only these child processes and preserves chain/service state.'
wait
