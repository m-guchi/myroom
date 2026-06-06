#!/usr/bin/env bash
# Run all automated checks (backend tests, frontend tests, typecheck, build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "== Backend tests =="
cd "$ROOT"
if [[ -d "$ROOT/venv" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/venv/bin/activate"
fi
python3 -m pip install -q -r requirements-dev.txt
DB_MOCK=true python3 -m pytest tests/ -q

echo "== Frontend typecheck =="
cd "$ROOT/frontend"
npm run typecheck

echo "== Frontend tests =="
npm run test

echo "== Frontend build =="
npm run build

echo ""
echo "All checks passed."
