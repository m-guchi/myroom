#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

load_env_if_needed() {
  if [[ -n "${AIRCON_EMAIL:-}" && -n "${AIRCON_PASSWORD:-}" ]]; then
    return 0
  fi

  local env_file="${INSTALL_DIR}/.env"
  if [[ ! -f "${env_file}" ]]; then
    echo ".env not found: ${env_file}" >&2
    exit 1
  fi
  if [[ ! -r "${env_file}" ]]; then
    echo "Cannot read ${env_file}" >&2
    echo "Run: sudo ${INSTALL_DIR}/run-aircon-collector.sh $*" >&2
    exit 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "${env_file}"
  set +a
}

load_env_if_needed

if [[ -z "${AIRCON_EMAIL:-}" || -z "${AIRCON_PASSWORD:-}" ]]; then
  echo "AIRCON_EMAIL / AIRCON_PASSWORD not set; skip."
  exit 0
fi
if [[ "${AIRCON_EMAIL}" == "your@email.com" ]]; then
  echo "AIRCON_EMAIL is still placeholder; skip."
  exit 0
fi

exec "${INSTALL_DIR}/venv/bin/python3" "${INSTALL_DIR}/aircon_to_myroom.py" "$@"
