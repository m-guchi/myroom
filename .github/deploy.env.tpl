# 1Password secret references for GitHub Actions deploy.
# Vault: apps — MyRoom / DB (deploy vars) + githubaction-sshkey (SSH key). See README.md.
APP_PASSWORD=op://apps/MyRoom/app-password
DISCORD_WEBHOOK_URL=op://apps/MyRoom/discord-webhook-url
DB_NAME=op://apps/MyRoom/db-name
DB_USER=op://apps/DB/db-user
DB_PASSWORD=op://apps/DB/db-password
DB_HOST=op://apps/DB/db-host
DB_PORT=op://apps/DB/db-port
SSH_PRIVATE_KEY=op://apps/githubaction-sshkey/private_key?ssh-format=openssh
HOST=op://apps/MyRoom/host
USERNAME=op://apps/MyRoom/username
SSH_PORT=op://apps/MyRoom/ssh-port
TARGET_DIR=op://apps/MyRoom/target-dir
