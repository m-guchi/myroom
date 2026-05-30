#!/usr/bin/env bash
# Stop local dev servers started by scripts/start-*.sh
set -euo pipefail

echo "Stopping backend and frontend..."

pkill -f "uvicorn backend.main:app" 2>/dev/null || true
pkill -f "next dev --port 5173" 2>/dev/null || true

if command -v fuser >/dev/null 2>&1; then
  fuser -k 8000/tcp 5173/tcp 2>/dev/null || true
fi

echo "Done."
echo "Note: SSH tunnel (port 3307) is left running if you started it separately."
echo "      To stop the tunnel, kill the ssh process or close that terminal."
