#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed. Install Node 20+ and retry."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Install npm and retry."
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Installing dependencies..."
npm install

echo "Checking DATABASE_URL from .env..."
DATABASE_URL_VALUE="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
if [ -z "${DATABASE_URL_VALUE}" ]; then
  echo "DATABASE_URL is missing in .env. Update it, then run: npm run db:push"
  exit 0
fi

echo "Pushing Prisma schema..."
npm run db:push

cat <<'EOF'
Local setup complete.
Next steps:
  1) Optionally set OPENAI_API_KEY in .env for AI enrichment.
  2) Start the app with: npm run dev
EOF
