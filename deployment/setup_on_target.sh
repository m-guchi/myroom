#!/bin/bash
set -e

# Detect current directory
APP_DIR=$(pwd)
PYTHON_PATH=$(which python3)

echo "--- Deployment Setup ---"
echo "App Directory: $APP_DIR"
echo "Python Path: $PYTHON_PATH"

if [ -z "$PYTHON_PATH" ]; then
    echo "Error: python3 not found."
    exit 1
fi

echo "1. Installing Python dependencies..."
pip install -r requirements.txt

echo "2. Generating Systemd services..."

# Replace placeholders in templates
sed -e "s|{{APP_DIR}}|$APP_DIR|g" \
    -e "s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/insight-backend.service.template > /etc/systemd/system/insight-backend.service

sed -e "s|{{APP_DIR}}|$APP_DIR|g" \
    -e "s|{{PYTHON_PATH}}|$PYTHON_PATH|g" \
    deployment/insight-frontend.service.template > /etc/systemd/system/insight-frontend.service

echo "3. Reloading and restarting services..."
systemctl daemon-reload
systemctl enable insight-backend
systemctl enable insight-frontend
systemctl restart insight-backend
systemctl restart insight-frontend

echo "Services active!"
systemctl status insight-backend --no-pager
systemctl status insight-frontend --no-pager

echo ""
echo "--- Apache Setup Hint ---"
echo "1. Enable required Apache modules:"
echo "   sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers"
echo "   sudo systemctl restart apache2"
echo ""
echo "2. Configure VirtualHost:"
echo "   Copy the content from deployment/apache.conf into your Apache config file"
echo "   (e.g., /etc/apache2/sites-available/000-default-le-ssl.conf)"
echo "   Then restart Apache."
