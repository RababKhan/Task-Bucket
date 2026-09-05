#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 server (e.g. an EC2 instance).
# Run it as the default `ubuntu` user:
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/deploy/bootstrap.sh -o bootstrap.sh
#   bash bootstrap.sh
#
# Installs Docker, adds swap (a 1 GB instance cannot run Postgres + Next
# without it), opens the firewall, and creates /opt/task-bucket.
set -euo pipefail

APP_DIR=/opt/task-bucket
SWAP_SIZE=2G

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

if [[ $EUID -eq 0 ]]; then
  echo "Run as a normal user with sudo, not as root." >&2
  exit 1
fi

log "Updating packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

log "Installing Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed — skipping."
fi

log "Adding $USER to the docker group"
sudo usermod -aG docker "$USER"

log "Configuring ${SWAP_SIZE} of swap"
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l "$SWAP_SIZE" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  # Prefer RAM; use swap only under real pressure.
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf >/dev/null
  sudo sysctl -p /etc/sysctl.d/99-swap.conf >/dev/null
else
  echo "Swap already present — skipping."
fi

log "Opening the firewall (SSH, HTTP, HTTPS)"
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

log "Enabling unattended security updates"
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

log "Creating $APP_DIR"
sudo mkdir -p "$APP_DIR"/backups
sudo chown -R "$USER:$USER" "$APP_DIR"

log "Done"
cat <<EOF

Next steps:

  1. Log out and back in (so the docker group applies), then check:
       docker run --rm hello-world

  2. Copy these files from the repo into $APP_DIR:
       docker-compose.prod.yml
       deploy/Caddyfile        -> $APP_DIR/deploy/Caddyfile
       deploy/backup.sh        -> $APP_DIR/deploy/backup.sh
       .env.prod.example       -> $APP_DIR/.env.prod

  3. Fill in $APP_DIR/.env.prod, then:
       chmod 600 $APP_DIR/.env.prod

  4. Start it:
       cd $APP_DIR
       docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

EOF
