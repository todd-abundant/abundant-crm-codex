#!/usr/bin/env bash
npm run db:sync

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"

if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: lsof is required to detect running app instances."
  exit 1
fi

PIDS="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN || true)"
if [ -n "$PIDS" ]; then
  echo "Stopping app process(es) on port ${PORT}: ${PIDS}"
  kill $PIDS || true
  sleep 1
fi

REMAINING_PIDS="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN || true)"
if [ -n "$REMAINING_PIDS" ]; then
  echo "Force-stopping remaining process(es): ${REMAINING_PIDS}"
  kill -9 $REMAINING_PIDS || true
fi

echo "Starting app in dev mode on port ${PORT}..."
npm run dev -- --port "${PORT}"
