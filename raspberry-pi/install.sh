#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/myroom-pi}"
SERVICE_NAME="switchbot-co2"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
cp "${SCRIPT_DIR}/switchbot_to_myroom.py" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/requirements.txt" "${INSTALL_DIR}/"

if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  cp "${SCRIPT_DIR}/.env.example" "${INSTALL_DIR}/.env"
  echo "Created ${INSTALL_DIR}/.env — edit SWITCHBOT_MAC before running."
fi

if ! id switchbot >/dev/null 2>&1; then
  useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin switchbot
fi

python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt"

usermod -aG bluetooth switchbot || true

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=SwitchBot CO2 to MyRoom
After=network-online.target bluetooth.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/venv/bin/python3 ${INSTALL_DIR}/switchbot_to_myroom.py
Nice=10

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${SERVICE_NAME}.timer" <<EOF
[Unit]
Description=Run SwitchBot CO2 collector every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

chmod 600 "${INSTALL_DIR}/.env"
chown -R switchbot:switchbot "${INSTALL_DIR}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.timer"

echo
echo "Installed."
echo "1. Edit ${INSTALL_DIR}/.env (set SWITCHBOT_MAC and MYROOM_API_URL)"
echo "2. Test: ${INSTALL_DIR}/venv/bin/python3 ${INSTALL_DIR}/switchbot_to_myroom.py --dry-run --debug"
echo "3. Start timer: sudo systemctl start ${SERVICE_NAME}.timer"
echo "4. Logs: journalctl -u ${SERVICE_NAME}.service -f"
