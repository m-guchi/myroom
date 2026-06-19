#!/bin/bash
# Create ./venv without sudo (for deploy users like github-user).
# Ubuntu 24.04 (PEP 668): system pip --user is blocked, so fallback uses virtualenv.pyz.
set -euo pipefail

APP_DIR="${1:-.}"
cd "$APP_DIR"

if [[ -x venv/bin/python3 ]]; then
  exit 0
fi

echo "Creating virtual environment..."

VIRTUALENV_PYZ_URL="${VIRTUALENV_PYZ_URL:-https://bootstrap.pypa.io/virtualenv/virtualenv.pyz}"

create_with_virtualenv_pyz() {
  echo "python3-venv unavailable; bootstrapping with virtualenv.pyz (no sudo, no system pip)..."
  rm -rf venv
  curl -sS "$VIRTUALENV_PYZ_URL" -o /tmp/virtualenv.pyz
  python3 /tmp/virtualenv.pyz venv
}

try_create_venv_module() {
  rm -rf venv
  python3 -m venv venv
  [[ -x venv/bin/python3 ]]
}

if try_create_venv_module 2>/dev/null; then
  :
else
  create_with_virtualenv_pyz
fi

if [[ ! -x venv/bin/python3 ]]; then
  echo "Failed to create virtual environment." >&2
  echo "Ask a server admin to run once: sudo apt install python3-venv" >&2
  exit 1
fi

echo "Virtual environment ready."
