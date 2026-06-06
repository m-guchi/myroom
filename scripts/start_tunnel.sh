#!/bin/bash
# SSH tunnel only (foreground). For full stack use: ./scripts/start.sh prod

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/tunnel.sh
source "${SCRIPT_DIR}/lib/tunnel.sh"

echo "Starting SSH tunnel to production database..."
echo "Local port: ${TUNNEL_LOCAL_PORT} -> Remote port: ${TUNNEL_REMOTE_PORT}"

if tunnel_is_listening; then
  echo "Error: Port ${TUNNEL_LOCAL_PORT} is already in use. Is the tunnel already running?"
  exit 1
fi

if [[ ! -f "${TUNNEL_SSH_KEY}" ]]; then
  echo "Error: SSH key not found: ${TUNNEL_SSH_KEY}"
  exit 1
fi

ssh -i "${TUNNEL_SSH_KEY}" \
  -L "${TUNNEL_LOCAL_PORT}:localhost:${TUNNEL_REMOTE_PORT}" \
  "${TUNNEL_SSH_HOST}" \
  -p "${TUNNEL_SSH_PORT}" \
  -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=60
