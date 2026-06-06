# 1Password secret references for GitHub Actions deploy.
# Vault: apps — MyRoom (deploy vars) + githubaction-sshkey (SSH key). See README.md.
NEXT_PUBLIC_APP_PASSWORD=op://apps/MyRoom/app-password
SSH_PRIVATE_KEY=op://apps/githubaction-sshkey/private key?ssh-format=openssh
HOST=op://apps/MyRoom/host
USERNAME=op://apps/MyRoom/username
SSH_PORT=op://apps/MyRoom/ssh-port
TARGET_DIR=op://apps/MyRoom/target-dir
