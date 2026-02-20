#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repository."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "HEAD" ]; then
  echo "Error: detached HEAD. Check out a branch before pulling."
  exit 1
fi

echo "Fetching latest refs from origin..."
git fetch origin

echo "Pulling latest commits for '${BRANCH}' with rebase and autostash..."
git pull --rebase --autostash origin "${BRANCH}"
echo "Pull complete."
