#!/usr/bin/env bash
# Start SSH tunnel + backend + frontend with production database data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/tunnel.sh
source "${SCRIPT_DIR}/lib/tunnel.sh"

export DB_MOCK=false

cleanup_prod_stack() {
  cleanup_services
  stop_ssh_tunnel_if_started
}

trap cleanup_prod_stack EXIT INT TERM

echo "=== Production data — DB_MOCK=false ==="
ensure_ssh_tunnel

setup_python
echo "Checking database connection..."
if ! python check_db.py; then
  echo "Error: Cannot connect to the database. Fix tunnel/DB settings in .env and retry."
  exit 1
fi

setup_frontend_deps
start_backend
start_frontend
print_urls
wait "$BACKEND_PID" "$FRONTEND_PID"
