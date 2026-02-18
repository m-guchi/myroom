# Insight MyRoom Deployment Guide

This folder contains the configuration files and scripts needed to deploy the application on your remote Ubunut/Debian server.

## Prerequisites
- A Linux server (Ubuntu/Debian recommended).
- `python3` and `pip` installed.
- `nginx` installed (`sudo apt install nginx`).
- Root or Sudo access.

## Steps

### 1. Transfer Files
Copy the entire project folder to your server (e.g., using `scp` or `git clone`).
```bash
scp -r /path/to/insight_myroom user@your-server:/home/user/
```

### 2. Run Setup Script
SSH into your server and run the included setup script. This will install Python dependencies and set up the Systemd services automatically.
```bash
cd insight_myroom
sudo ./deployment/setup_on_target.sh
```

### 3. Configure Apache
The server uses Apache. You need to enable proxy modules and configure the VirtualHost.

1. Enable modules:
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo systemctl restart apache2
```

2. Edit Configuration:
Merge the content of `deployment/apache.conf` into your existing Apache SSL config (usually `/etc/apache2/sites-available/default-ssl.conf` or similar).

Key settings provided in `apache.conf`:
- `ProxyPass /insight-myroom/api/ http://127.0.0.1:8000/` (Backend)
- Rewrite rules for Streamlit WebSocket support.
- `ProxyPass /insight-myroom/ http://127.0.0.1:8501/` (Frontend)

3. Restart Apache:
```bash
sudo systemctl restart apache2
```

### 4. Verify
Access your application at:
- `https://app.minagu.work/insight-myroom/`

**Note**: Ensure your main Apache config handles SSL (Certbot) correctly. The provided snippet assumes existing SSL setup.

