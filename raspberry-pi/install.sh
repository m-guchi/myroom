#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/myroom-pi}"
SWITCHBOT_SERVICE="switchbot-co2"
AIRCON_SERVICE="aircon-myroom"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo ./install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing to ${INSTALL_DIR}..."
mkdir -p "${INSTALL_DIR}"
cp "${SCRIPT_DIR}/switchbot_to_myroom.py" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/aircon_to_myroom.py" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/aircloudhome_client.py" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/run-aircon-collector.sh" "${INSTALL_DIR}/"
cp "${SCRIPT_DIR}/requirements.txt" "${INSTALL_DIR}/"

# 作業ディレクトリの .env / sensors.json を優先（無ければ *.example）
_env_source="${SCRIPT_DIR}/.env"
if [[ ! -f "${_env_source}" ]]; then
  _env_source="${SCRIPT_DIR}/.env.example"
fi
if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  cp "${_env_source}" "${INSTALL_DIR}/.env"
  echo "Created ${INSTALL_DIR}/.env from $(basename "${_env_source}")."
else
  echo "Keeping existing ${INSTALL_DIR}/.env"
fi

_sensors_source="${SCRIPT_DIR}/sensors.json"
if [[ ! -f "${_sensors_source}" ]]; then
  _sensors_source="${SCRIPT_DIR}/sensors.json.example"
fi
if [[ ! -f "${INSTALL_DIR}/sensors.json" ]]; then
  cp "${_sensors_source}" "${INSTALL_DIR}/sensors.json"
  echo "Created ${INSTALL_DIR}/sensors.json from $(basename "${_sensors_source}")."
else
  echo "Keeping existing ${INSTALL_DIR}/sensors.json"
fi

if ! id switchbot >/dev/null 2>&1; then
  useradd --system --home "${INSTALL_DIR}" --shell /usr/sbin/nologin switchbot
fi

python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/requirements.txt"

usermod -aG bluetooth switchbot || true

chmod 755 "${INSTALL_DIR}/run-aircon-collector.sh"

cat > "/etc/systemd/system/${SWITCHBOT_SERVICE}.service" <<EOF
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

cat > "/etc/systemd/system/${SWITCHBOT_SERVICE}.timer" <<EOF
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

cat > "/etc/systemd/system/${AIRCON_SERVICE}.service" <<EOF
[Unit]
Description=AirCloud Home aircon to MyRoom
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=switchbot
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=${INSTALL_DIR}/run-aircon-collector.sh
Nice=10

[Install]
WantedBy=multi-user.target
EOF

cat > "/etc/systemd/system/${AIRCON_SERVICE}.timer" <<EOF
[Unit]
Description=Run aircon collector every 5 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
EOF

chmod 600 "${INSTALL_DIR}/.env"
chown -R switchbot:switchbot "${INSTALL_DIR}"
# aircon-myroom runs as switchbot; root-owned .env breaks load_dotenv / manual runs
chown root:root "${INSTALL_DIR}/run-aircon-collector.sh"

systemctl daemon-reload
systemctl enable "${SWITCHBOT_SERVICE}.timer"
systemctl enable "${AIRCON_SERVICE}.timer"

echo
echo "Installed."
echo
echo "SwitchBot CO2:"
echo "  1. If needed, edit ${INSTALL_DIR}/sensors.json and .env (copied from this directory when missing)"
echo "  2. Test: sudo ${INSTALL_DIR}/venv/bin/python3 ${INSTALL_DIR}/switchbot_to_myroom.py --dry-run --debug"
echo "  3. Start: sudo systemctl start ${SWITCHBOT_SERVICE}.timer"
echo "  4. Logs: journalctl -u ${SWITCHBOT_SERVICE}.service -f"
echo
echo "Aircon (AirCloud Home):"
echo "  1. Edit ${INSTALL_DIR}/.env (AIRCON_EMAIL, AIRCON_PASSWORD, MYROOM_AIRCON_API_URL)"
echo "  2. Test: sudo ${INSTALL_DIR}/run-aircon-collector.sh --dry-run --debug"
echo "  3. Start: sudo systemctl start ${AIRCON_SERVICE}.timer"
echo "  4. Logs: journalctl -u ${AIRCON_SERVICE}.service -f"
