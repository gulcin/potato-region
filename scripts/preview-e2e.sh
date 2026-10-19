#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/peer-broker.mjs &
broker=$!
cleanup() { kill "$broker" 2>/dev/null || true; }
trap cleanup EXIT
export VITE_FEEDBACK_URL="${VITE_FEEDBACK_URL:-http://127.0.0.1:4173/potato-region/api/feedback}"
export VITE_PEER_HOST=127.0.0.1
export VITE_PEER_PORT=9000
export VITE_PEER_PATH=/signal
export VITE_PEER_SECURE=false
export VITE_PARTY_TEST=1
npm run build
exec npx vite preview --host 127.0.0.1 --port 4173 --strictPort
