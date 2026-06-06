#!/usr/bin/env bash
# Unified entry point for local development.
#
# Usage:
#   ./scripts/start.sh mock   # mock data (DB_MOCK=true)
#   ./scripts/start.sh prod   # production DB via SSH tunnel (DB_MOCK=false)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/start.sh <mode>

Modes:
  mock, dev, development   Start with mock data (no DB, no SSH tunnel)
  prod, production         Start with production DB (SSH tunnel required)

Examples:
  ./scripts/start.sh mock
  ./scripts/start.sh prod

Stop running servers:
  ./scripts/stop.sh
EOF
}

mode="${1:-}"
case "${mode}" in
  mock | dev | development)
    exec "${SCRIPT_DIR}/start-mock.sh"
    ;;
  prod | production)
    exec "${SCRIPT_DIR}/start-prod-db.sh"
    ;;
  -h | --help | help | "")
    usage
    [[ -n "${mode}" ]] || exit 1
    ;;
  *)
    echo "Unknown mode: ${mode}"
    echo ""
    usage
    exit 1
    ;;
esac
