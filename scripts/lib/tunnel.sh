# SSH tunnel helpers for production database access.
# shellcheck shell=bash

TUNNEL_PID=""
TUNNEL_LOCAL_PORT="${TUNNEL_LOCAL_PORT:-3307}"
TUNNEL_REMOTE_PORT="${TUNNEL_REMOTE_PORT:-3306}"
TUNNEL_SSH_HOST="${TUNNEL_SSH_HOST:-guchi@162.43.74.7}"
TUNNEL_SSH_PORT="${TUNNEL_SSH_PORT:-19622}"
TUNNEL_SSH_KEY="${TUNNEL_SSH_KEY:-$HOME/.ssh/shinvps-20260215}"

tunnel_is_listening() {
  ss -tuln 2>/dev/null | grep -q ":${TUNNEL_LOCAL_PORT} "
}

ensure_ssh_tunnel() {
  if tunnel_is_listening; then
    echo "SSH tunnel already listening on port ${TUNNEL_LOCAL_PORT}."
    return 0
  fi

  if [[ ! -f "${TUNNEL_SSH_KEY}" ]]; then
    echo "Error: SSH key not found: ${TUNNEL_SSH_KEY}"
    exit 1
  fi

  echo "Starting SSH tunnel (local ${TUNNEL_LOCAL_PORT} -> remote ${TUNNEL_REMOTE_PORT})..."
  ssh -i "${TUNNEL_SSH_KEY}" \
    -L "${TUNNEL_LOCAL_PORT}:localhost:${TUNNEL_REMOTE_PORT}" \
    "${TUNNEL_SSH_HOST}" \
    -p "${TUNNEL_SSH_PORT}" \
    -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=60 &
  TUNNEL_PID=$!

  local i
  for i in $(seq 1 20); do
    if tunnel_is_listening; then
      echo "SSH tunnel is up."
      return 0
    fi
    sleep 0.5
  done

  echo "Error: SSH tunnel failed to bind port ${TUNNEL_LOCAL_PORT}."
  exit 1
}

stop_ssh_tunnel_if_started() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
