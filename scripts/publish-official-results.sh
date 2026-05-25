#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MESSAGE="${1:-Update official results}"

if [[ ! -f artifacts/public-results/latest.json ]]; then
  echo "Missing artifacts/public-results/latest.json" >&2
  exit 1
fi

pnpm --dir apps/web run qa:public-result-summary
pnpm --dir apps/web run qa:skatebench-visualizer
pnpm --dir apps/web run qa:result-isolation
pnpm --dir apps/web run qa:front-facing-copy
pnpm --dir apps/web run qa:scenario-exposure
pnpm --dir apps/web run build:public-site
node --experimental-strip-types scripts/validatePublicReleaseTree.ts

TRACKED_ARTIFACTS="$(git ls-files artifacts)"
if [[ "$TRACKED_ARTIFACTS" != "artifacts/public-results/latest.json" ]]; then
  echo "Tracked artifacts must be only artifacts/public-results/latest.json; got:" >&2
  echo "$TRACKED_ARTIFACTS" >&2
  exit 1
fi

git add artifacts/public-results/latest.json
if git diff --cached --quiet; then
  echo "No changes to artifacts/public-results/latest.json; nothing to publish."
  exit 0
fi

git commit -m "$MESSAGE"
git push origin main

echo "Published official results. GitHub Pages deploy will run on push to main."
