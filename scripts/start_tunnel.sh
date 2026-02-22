#!/bin/bash

# SSH Tunnel for production database access
# Maps local 3307 to production 3306

echo "Starting SSH tunnel to production database..."
echo "Local port: 3307 -> Remote port: 3306"

# Check if port 3307 is already in use
if ss -tuln | grep -q :3307; then
    echo "Error: Port 3307 is already in use. Is the tunnel already running?"
    exit 1
fi

ssh -i ~/.ssh/shinvps-20260215 -L 3307:localhost:3306 guchi@162.43.74.7 -p 19622 -N
