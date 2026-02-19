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
  echo "Error: detached HEAD. Check out a branch before pushing."
  exit 1
fi

git add -A

if ! git diff --cached --quiet; then
  COMMIT_MESSAGE="${1:-chore: update project files ($(date '+%Y-%m-%d %H:%M:%S'))}"
  echo "Creating commit: ${COMMIT_MESSAGE}"
  git commit -m "${COMMIT_MESSAGE}"
else
  echo "No staged changes to commit."
fi

echo "Pushing branch '${BRANCH}' to origin..."
git push -u origin "${BRANCH}"
echo "Push complete."
