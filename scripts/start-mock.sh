#!/usr/bin/env bash
# Start backend + frontend with mock data (no database).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

# Override .env: python-dotenv does not replace existing env vars.
export DB_MOCK=true

run_dev_stack "Development data (mock) — DB_MOCK=true"
