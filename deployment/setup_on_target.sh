#!/bin/bash
set -e

# Configuration
APP_DIR=$(pwd)
PYTHON_PATH="$APP_DIR/venv/bin/python3"

echo "Setting up MyRoom on $(hostname)..."
echo "App Directory: $APP_DIR"

# Create venv if not exists
if [ ! -x "venv/bin/python3" ]; then
    bash deployment/ensure_venv.sh
    ./venv/bin/python3 -m pip install -r requirements.txt
fi

# Install systemd services
echo "Installing systemd services..."
sed "s|{{APP_DIR}}|$APP_DIR|g; s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/myroom-backend.service.template > /etc/systemd/system/myroom-backend.service

sed "s|{{APP_DIR}}|$APP_DIR|g; s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/myroom-frontend.service.template > /etc/systemd/system/myroom-frontend.service

sed "s|{{APP_DIR}}|$APP_DIR|g; s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/myroom-sensor-monitor.service.template > /etc/systemd/system/myroom-sensor-monitor.service

sed "s|{{APP_DIR}}|$APP_DIR|g; s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/myroom-sensor-monitor.timer.template > /etc/systemd/system/myroom-sensor-monitor.timer

systemctl daemon-reload
systemctl enable myroom-backend
systemctl enable myroom-frontend
systemctl enable myroom-sensor-monitor.timer
systemctl restart myroom-backend
systemctl restart myroom-frontend
systemctl restart myroom-sensor-monitor.timer

echo "Service status:"
systemctl status myroom-backend --no-pager
systemctl status myroom-frontend --no-pager

echo ""
echo "Next steps:"
echo "1. Configure Apache/Nginx using deployment/apache.conf or deployment/nginx.conf"
echo "2. Update production URL path from /insight-myroom/ to /myroom/ if migrating"
echo "3. Verify: https://myroom.gucchii.com/"
