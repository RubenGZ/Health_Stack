# healthstack-pi-server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and publish the `healthstack-pi-server` GitHub repo under RubenGZ with all scripts, configs, and templates needed to deploy HealthStack Pro on a Raspberry Pi 3B.

**Architecture:** Ops companion repo — a local directory is initialised, all files written, then pushed to a new GitHub repo via API. The new repo's `docker-compose.pi.yml` (with EXPOSE_MODE profiles) is the canonical Pi compose file; `scripts/03-deploy.sh` copies it into the Health_Stack clone on the Pi before launching.

**Tech Stack:** Bash scripts, Docker Compose v2 profiles, nginx, cloudflared, GitHub API (curl).

---

## File Map

### New repo — `C:\Users\josel\OneDrive\Escritorio\CLAUDE\healthstack-pi-server\`

| Path | Responsibility |
|------|---------------|
| `README.md` | Full setup guide (quickstart + phases) |
| `docker-compose.pi.yml` | All services; cloudflared/certbot gated by EXPOSE_MODE profile |
| `nginx/nginx.cloudflare.conf` | HTTP-only nginx (quick + cloudflare modes) |
| `nginx/nginx.domain.conf` | HTTPS nginx with Let's Encrypt (domain mode) |
| `templates/.env.pi.example` | EXPOSE_MODE, passwords, CLOUDFLARE_TUNNEL_TOKEN |
| `templates/backend.env.example` | JWT keys, MASTER_KEY, ALLOWED_ORIGINS |
| `scripts/01-system.sh` | OS update, 1 GB swap, GPU split 16 MB |
| `scripts/02-docker.sh` | Docker Engine + Compose plugin (arm64) |
| `scripts/03-deploy.sh` | Clone repos, copy configs, build & launch |
| `scripts/04-cloudflare.sh` | Named tunnel setup guide + verification |
| `scripts/update.sh` | git pull + docker compose restart |

### Health_Stack repo — branch `feat/pi-server` (already checked out)

| Path | Change |
|------|--------|
| `docker-compose.pi.yml` | Add deprecation note pointing to ops repo |

---

## Task 1: Create GitHub repo and initialise local directory

**Files:**
- Create: `C:\Users\josel\OneDrive\Escritorio\CLAUDE\healthstack-pi-server\` (directory)

- [ ] **Step 1: Create repo via GitHub API**

```bash
curl -s -X POST \
  -H "Authorization: token <YOUR_GITHUB_PAT>" \
  -H "Content-Type: application/json" \
  https://api.github.com/user/repos \
  -d '{
    "name": "healthstack-pi-server",
    "description": "Raspberry Pi deployment ops for HealthStack Pro — Cloudflare Tunnel + custom domain",
    "private": false,
    "auto_init": false
  }'
```

Expected: JSON with `"full_name": "RubenGZ/healthstack-pi-server"` and `"html_url"`.

- [ ] **Step 2: Initialise local directory**

```bash
mkdir -p ~/healthstack-pi-server
cd ~/healthstack-pi-server
git init
git remote add origin https://<YOUR_GITHUB_PAT>@github.com/<YOUR_USER>/healthstack-pi-server.git
```

---

## Task 2: `docker-compose.pi.yml` with EXPOSE_MODE profiles

**Files:**
- Create: `healthstack-pi-server/docker-compose.pi.yml`

- [ ] **Step 1: Write the compose file**

```yaml
# =============================================================================
# HealthStack Pro — Raspberry Pi
# EXPOSE_MODE controls which tunnel/TLS service is active:
#   quick      → Cloudflare Quick Tunnel (*.trycloudflare.com, no account)
#   cloudflare → Cloudflare Named Tunnel (stable URL, needs CLOUDFLARE_TUNNEL_TOKEN)
#   domain     → Let's Encrypt / custom domain (needs DOMAIN + certbot volume)
#
# Usage:
#   cp templates/.env.pi.example .env.pi        # set EXPOSE_MODE + passwords
#   cp templates/backend.env.example backend/.env
#   docker compose -f docker-compose.pi.yml \
#     --env-file .env.pi \
#     --profile ${EXPOSE_MODE} \
#     up -d --build
# =============================================================================

services:

  postgres:
    image: postgres:16-alpine
    container_name: healthstack_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: healthstack
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8"
    command: >
      postgres
        -c shared_buffers=128MB
        -c max_connections=50
        -c effective_cache_size=256MB
        -c work_mem=4MB
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d healthstack"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - internal

  redis:
    image: redis:7-alpine
    container_name: healthstack_redis
    restart: unless-stopped
    command: >
      redis-server
        --requirepass ${REDIS_PASSWORD}
        --appendonly yes
        --maxmemory 128mb
        --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 15s
      timeout: 5s
      retries: 5
    networks:
      - internal

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: healthstack_backend
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - ./backend/.env
    environment:
      APP_ENV: production
      DEBUG: "false"
      DATABASE_URL: postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres:5432/healthstack
      DATABASE_SYNC_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/healthstack
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
    command: >
      sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    networks:
      - internal

  nginx:
    image: nginx:1.25-alpine
    container_name: healthstack_nginx
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.cloudflare.conf:/etc/nginx/nginx.conf:ro
      - ./frontend:/usr/share/nginx/html/app:ro
      - ./landing/dist:/usr/share/nginx/html/landing:ro
    networks:
      - internal
      - external

  # ---------------------------------------------------------------------------
  # EXPOSE_MODE=quick — Cloudflare Quick Tunnel (no account, random URL)
  # ---------------------------------------------------------------------------
  cloudflared-quick:
    image: cloudflare/cloudflared:latest
    container_name: healthstack_tunnel_quick
    restart: unless-stopped
    profiles: ["quick"]
    command: tunnel --no-autoupdate --url http://nginx:80
    depends_on:
      - nginx
    networks:
      - external

  # ---------------------------------------------------------------------------
  # EXPOSE_MODE=cloudflare — Cloudflare Named Tunnel (stable URL, needs token)
  # ---------------------------------------------------------------------------
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: healthstack_tunnel
    restart: unless-stopped
    profiles: ["cloudflare"]
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - nginx
    networks:
      - external

  # ---------------------------------------------------------------------------
  # EXPOSE_MODE=domain — nginx SSL + Let's Encrypt certbot
  # ---------------------------------------------------------------------------
  nginx-ssl:
    image: nginx:1.25-alpine
    container_name: healthstack_nginx_ssl
    restart: unless-stopped
    profiles: ["domain"]
    depends_on:
      - backend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.domain.conf:/etc/nginx/nginx.conf:ro
      - ./frontend:/usr/share/nginx/html/app:ro
      - ./landing/dist:/usr/share/nginx/html/landing:ro
      - certbot_www:/var/www/certbot:ro
      - certbot_conf:/etc/letsencrypt:ro
    networks:
      - internal
      - external

  certbot:
    image: certbot/certbot:latest
    container_name: healthstack_certbot
    profiles: ["domain"]
    volumes:
      - certbot_www:/var/www/certbot
      - certbot_conf:/etc/letsencrypt
    entrypoint: >
      sh -c "trap exit TERM;
             while :; do
               certbot renew --webroot -w /var/www/certbot --quiet;
               sleep 12h & wait $${!};
             done"

networks:
  internal:
    driver: bridge
    internal: true
  external:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  certbot_www:
  certbot_conf:
```

- [ ] **Step 2: Verify syntax**

```bash
# On a machine with Docker installed, or skip and verify on the Pi later
docker compose -f docker-compose.pi.yml config --quiet 2>&1
```

Expected: no errors (or skip on Windows without Docker).

---

## Task 3: nginx configs

**Files:**
- Create: `healthstack-pi-server/nginx/nginx.cloudflare.conf`
- Create: `healthstack-pi-server/nginx/nginx.domain.conf`

- [ ] **Step 1: Write `nginx.cloudflare.conf`** (HTTP only — Cloudflare handles TLS)

```nginx
user  nginx;
worker_processes  auto;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections  512;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    sendfile      on;
    tcp_nopush    on;
    keepalive_timeout 65;
    server_tokens off;

    gzip          on;
    gzip_types    text/plain text/css application/json application/javascript
                  text/xml application/xml text/javascript;
    gzip_min_length 1024;

    limit_req_zone $binary_remote_addr zone=api:10m  rate=100r/m;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

    upstream backend {
        server backend:8000;
        keepalive 16;
    }

    server {
        listen 80;
        server_name _;

        real_ip_header     CF-Connecting-IP;
        set_real_ip_from   0.0.0.0/0;

        root /usr/share/nginx/html/app;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location /landing/ {
            alias /usr/share/nginx/html/landing/;
            try_files $uri $uri/ /landing/index.html;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto https;
            proxy_set_header   Connection        "";
        }

        location /api/v1/auth/ {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto https;
            proxy_set_header   Connection        "";
        }

        location /health {
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host $host;
            access_log         off;
        }

        location /metrics {
            deny all;
            return 403;
        }

        location ~ ^/(docs|redoc|openapi\.json) {
            deny all;
            return 403;
        }
    }
}
```

- [ ] **Step 2: Write `nginx.domain.conf`** (HTTPS + Let's Encrypt, phase 2)

```nginx
user  nginx;
worker_processes  auto;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections  512;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    sendfile      on;
    tcp_nopush    on;
    keepalive_timeout 65;
    server_tokens off;

    gzip          on;
    gzip_types    text/plain text/css application/json application/javascript
                  text/xml application/xml text/javascript;
    gzip_min_length 1024;

    limit_req_zone $binary_remote_addr zone=api:10m  rate=100r/m;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;

    upstream backend {
        server backend:8000;
        keepalive 16;
    }

    # Redirect HTTP → HTTPS
    server {
        listen 80;
        server_name ${DOMAIN};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        http2  on;
        server_name ${DOMAIN};

        ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        root /usr/share/nginx/html/app;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location /landing/ {
            alias /usr/share/nginx/html/landing/;
            try_files $uri $uri/ /landing/index.html;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto https;
            proxy_set_header   Connection        "";
        }

        location /api/v1/auth/ {
            limit_req zone=auth burst=5 nodelay;
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host              $host;
            proxy_set_header   X-Real-IP         $remote_addr;
            proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto https;
            proxy_set_header   Connection        "";
        }

        location /health {
            proxy_pass         http://backend;
            proxy_http_version 1.1;
            proxy_set_header   Host $host;
            access_log         off;
        }

        location /metrics {
            deny all;
            return 403;
        }

        location ~ ^/(docs|redoc|openapi\.json) {
            deny all;
            return 403;
        }
    }
}
```

---

## Task 4: Environment templates

**Files:**
- Create: `healthstack-pi-server/templates/.env.pi.example`
- Create: `healthstack-pi-server/templates/backend.env.example`

- [ ] **Step 1: Write `.env.pi.example`**

```bash
# =============================================================================
# .env.pi — HealthStack Pro Raspberry Pi environment
# Copy to: ~/health-stack/.env.pi
# =============================================================================

# --- Exposure mode ---
# quick      = Cloudflare Quick Tunnel (no account, random *.trycloudflare.com URL)
# cloudflare = Cloudflare Named Tunnel (stable URL, needs token below)
# domain     = Custom domain with Let's Encrypt (set DOMAIN below)
EXPOSE_MODE=quick

# --- Database ---
POSTGRES_PASSWORD=change_me_strong_password_here

# --- Redis ---
REDIS_PASSWORD=change_me_redis_password_here

# --- Cloudflare Named Tunnel (only needed if EXPOSE_MODE=cloudflare) ---
# Get token at: https://one.dash.cloudflare.com → Zero Trust → Networks → Tunnels
CLOUDFLARE_TUNNEL_TOKEN=

# --- Custom domain (only needed if EXPOSE_MODE=domain) ---
DOMAIN=yourdomain.com
```

- [ ] **Step 2: Write `backend.env.example`**

```bash
# =============================================================================
# backend/.env — HealthStack Pro backend secrets
# Copy to: ~/health-stack/backend/.env
# Generate RSA keys: openssl genrsa -out private.pem 2048
#                    openssl rsa -in private.pem -pubout -out public.pem
# Then paste the key contents below (replace newlines with \n)
# =============================================================================

APP_ENV=production
DEBUG=false

# JWT RS256 keys (replace newlines with literal \n)
JWT_PRIVATE_KEY_PEM=-----BEGIN RSA PRIVATE KEY-----\nPASTE_KEY_HERE\n-----END RSA PRIVATE KEY-----
JWT_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----\nPASTE_KEY_HERE\n-----END PUBLIC KEY-----

# AES-256 master key for health data encryption (64 hex chars)
# Generate: python3 -c "import secrets; print(secrets.token_hex(32))"
HEALTH_LINK_MASTER_KEY=generate_64_hex_chars_here

# CORS — set to your Cloudflare tunnel URL or custom domain
# Examples:
#   EXPOSE_MODE=quick:      update after cloudflared prints the URL
#   EXPOSE_MODE=cloudflare: https://your-tunnel-name.cfargotunnel.com
#   EXPOSE_MODE=domain:     https://yourdomain.com
ALLOWED_ORIGINS=https://your-tunnel-url-here.trycloudflare.com

SENTRY_DSN=
```

---

## Task 5: Setup scripts

**Files:**
- Create: `healthstack-pi-server/scripts/01-system.sh`
- Create: `healthstack-pi-server/scripts/02-docker.sh`
- Create: `healthstack-pi-server/scripts/03-deploy.sh`
- Create: `healthstack-pi-server/scripts/04-cloudflare.sh`
- Create: `healthstack-pi-server/scripts/update.sh`

- [ ] **Step 1: Write `01-system.sh`**

```bash
#!/usr/bin/env bash
# 01-system.sh — OS prep for Raspberry Pi 3B (1 GB RAM, 64 GB SD)
# Run as: bash 01-system.sh
set -euo pipefail

echo "==> Updating OS packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

echo "==> Configuring 1 GB swap..."
sudo dphys-swapfile swapoff 2>/dev/null || true
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=1024/' /etc/dphys-swapfile
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
echo "    Swap:"
free -h | grep Swap

echo "==> Reducing GPU memory split to 16 MB (headless server)..."
if grep -q "^gpu_mem=" /boot/config.txt 2>/dev/null; then
    sudo sed -i 's/^gpu_mem=.*/gpu_mem=16/' /boot/config.txt
elif grep -q "^gpu_mem=" /boot/firmware/config.txt 2>/dev/null; then
    sudo sed -i 's/^gpu_mem=.*/gpu_mem=16/' /boot/firmware/config.txt
else
    echo "gpu_mem=16" | sudo tee -a /boot/firmware/config.txt
fi

echo "==> Disabling Wi-Fi power management (prevents drops)..."
sudo iwconfig wlan0 power off 2>/dev/null || true

echo "==> Installing useful tools..."
sudo apt-get install -y -qq git curl jq

echo ""
echo "==> Done. Reboot recommended to apply GPU split:"
echo "    sudo reboot"
```

- [ ] **Step 2: Write `02-docker.sh`**

```bash
#!/usr/bin/env bash
# 02-docker.sh — Install Docker Engine + Compose plugin on Raspberry Pi OS 64-bit
# Run as: bash 02-docker.sh
set -euo pipefail

if command -v docker &>/dev/null; then
    echo "==> Docker already installed: $(docker --version)"
    exit 0
fi

echo "==> Installing Docker Engine (arm64)..."
curl -fsSL https://get.docker.com | sh

echo "==> Adding ${USER} to docker group (no sudo needed after re-login)..."
sudo usermod -aG docker "$USER"

echo "==> Enabling Docker on boot..."
sudo systemctl enable docker
sudo systemctl start docker

echo ""
echo "==> Docker installed: $(docker --version)"
echo "==> Docker Compose: $(docker compose version)"
echo ""
echo "IMPORTANT: Log out and back in (or run 'newgrp docker') before using Docker."
```

- [ ] **Step 3: Write `03-deploy.sh`**

```bash
#!/usr/bin/env bash
# 03-deploy.sh — Clone repos and launch HealthStack Pro on the Pi
# Run as: bash 03-deploy.sh
# Prerequisites: 01-system.sh and 02-docker.sh must have run first.
set -euo pipefail

HEALTH_STACK_DIR="$HOME/health-stack"
OPS_REPO_DIR="$HOME/healthstack-pi-server"

echo "==> Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not found. Run 02-docker.sh first."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: Docker Compose not found. Run 02-docker.sh first."; exit 1; }

echo "==> Cloning Health_Stack..."
if [ -d "$HEALTH_STACK_DIR/.git" ]; then
    echo "    Already cloned — pulling latest..."
    git -C "$HEALTH_STACK_DIR" pull
else
    git clone https://github.com/RubenGZ/Health_Stack.git "$HEALTH_STACK_DIR"
fi

echo "==> Cloning healthstack-pi-server (ops)..."
if [ -d "$OPS_REPO_DIR/.git" ]; then
    echo "    Already cloned — pulling latest..."
    git -C "$OPS_REPO_DIR" pull
else
    git clone https://github.com/RubenGZ/healthstack-pi-server.git "$OPS_REPO_DIR"
fi

echo "==> Copying Pi configs into Health_Stack directory..."
cp "$OPS_REPO_DIR/docker-compose.pi.yml" "$HEALTH_STACK_DIR/docker-compose.pi.yml"
cp -r "$OPS_REPO_DIR/nginx/" "$HEALTH_STACK_DIR/nginx/"

echo "==> Checking environment files..."
if [ ! -f "$HEALTH_STACK_DIR/.env.pi" ]; then
    cp "$OPS_REPO_DIR/templates/.env.pi.example" "$HEALTH_STACK_DIR/.env.pi"
    echo ""
    echo "  IMPORTANT: Edit $HEALTH_STACK_DIR/.env.pi before continuing!"
    echo "  At minimum set: POSTGRES_PASSWORD, REDIS_PASSWORD, EXPOSE_MODE"
    echo ""
    echo "  Then re-run this script."
    exit 1
fi

if [ ! -f "$HEALTH_STACK_DIR/backend/.env" ]; then
    cp "$OPS_REPO_DIR/templates/backend.env.example" "$HEALTH_STACK_DIR/backend/.env"
    echo ""
    echo "  IMPORTANT: Edit $HEALTH_STACK_DIR/backend/.env before continuing!"
    echo "  Set: JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM, HEALTH_LINK_MASTER_KEY, ALLOWED_ORIGINS"
    echo ""
    echo "  Then re-run this script."
    exit 1
fi

EXPOSE_MODE=$(grep '^EXPOSE_MODE=' "$HEALTH_STACK_DIR/.env.pi" | cut -d'=' -f2)
echo "==> EXPOSE_MODE=${EXPOSE_MODE}"

echo "==> Building and launching containers (profile: ${EXPOSE_MODE})..."
cd "$HEALTH_STACK_DIR"
docker compose -f docker-compose.pi.yml \
    --env-file .env.pi \
    --profile "${EXPOSE_MODE}" \
    up -d --build

echo ""
echo "==> Waiting for backend health check..."
sleep 10
docker compose -f docker-compose.pi.yml ps

echo ""
echo "==> Deploy complete!"
if [ "${EXPOSE_MODE}" = "quick" ]; then
    echo ""
    echo "  Cloudflare Quick Tunnel URL (check logs for the *.trycloudflare.com URL):"
    docker logs healthstack_tunnel_quick 2>&1 | grep -i "trycloudflare\|https://" | tail -5
fi
```

- [ ] **Step 4: Write `04-cloudflare.sh`**

```bash
#!/usr/bin/env bash
# 04-cloudflare.sh — Guide and verify Cloudflare Named Tunnel setup
# Run as: bash 04-cloudflare.sh
# This script is informational — the tunnel token comes from Cloudflare dashboard.
set -euo pipefail

HEALTH_STACK_DIR="$HOME/health-stack"
ENV_FILE="$HEALTH_STACK_DIR/.env.pi"

echo "============================================================"
echo " Cloudflare Named Tunnel Setup Guide"
echo "============================================================"
echo ""
echo " Steps to get your tunnel token:"
echo ""
echo " 1. Go to: https://one.dash.cloudflare.com"
echo " 2. Select your account → Zero Trust → Networks → Tunnels"
echo " 3. Click 'Create a tunnel' → give it a name (e.g. healthstack-pi)"
echo " 4. Choose 'Docker' as the connector"
echo " 5. Copy the token from the docker run command shown"
echo " 6. Under 'Public Hostname', add:"
echo "      Subdomain: (leave empty or choose one)"
echo "      Domain: (your Cloudflare domain)"
echo "      Service: http://localhost:80"
echo ""

if [ -f "$ENV_FILE" ]; then
    TOKEN=$(grep '^CLOUDFLARE_TUNNEL_TOKEN=' "$ENV_FILE" | cut -d'=' -f2)
    if [ -z "$TOKEN" ]; then
        echo " CLOUDFLARE_TUNNEL_TOKEN is empty in .env.pi"
        echo " Edit $ENV_FILE and set CLOUDFLARE_TUNNEL_TOKEN=<your-token>"
        echo " Then set EXPOSE_MODE=cloudflare and re-run 03-deploy.sh"
    else
        echo " Token found in .env.pi. Verifying tunnel status..."
        docker logs healthstack_tunnel 2>&1 | tail -10
    fi
else
    echo " .env.pi not found at $ENV_FILE"
    echo " Run 03-deploy.sh first."
fi
```

- [ ] **Step 5: Write `update.sh`**

```bash
#!/usr/bin/env bash
# update.sh — Pull latest code and restart containers
# Run as: bash update.sh
set -euo pipefail

HEALTH_STACK_DIR="$HOME/health-stack"
OPS_REPO_DIR="$HOME/healthstack-pi-server"

echo "==> Pulling latest Health_Stack..."
git -C "$HEALTH_STACK_DIR" pull

echo "==> Pulling latest ops configs..."
git -C "$OPS_REPO_DIR" pull

echo "==> Copying updated configs..."
cp "$OPS_REPO_DIR/docker-compose.pi.yml" "$HEALTH_STACK_DIR/docker-compose.pi.yml"
cp -r "$OPS_REPO_DIR/nginx/" "$HEALTH_STACK_DIR/nginx/"

EXPOSE_MODE=$(grep '^EXPOSE_MODE=' "$HEALTH_STACK_DIR/.env.pi" | cut -d'=' -f2)
echo "==> Rebuilding and restarting (profile: ${EXPOSE_MODE})..."

cd "$HEALTH_STACK_DIR"
docker compose -f docker-compose.pi.yml \
    --env-file .env.pi \
    --profile "${EXPOSE_MODE}" \
    up -d --build

echo "==> Update complete."
docker compose -f docker-compose.pi.yml ps
```

- [ ] **Step 6: Make scripts executable**

```bash
chmod +x scripts/*.sh
```

---

## Task 6: README

**Files:**
- Create: `healthstack-pi-server/README.md`

- [ ] **Step 1: Write README.md** (full quickstart + phases)

```markdown
# healthstack-pi-server

Ops companion repo for deploying [HealthStack Pro](https://github.com/RubenGZ/Health_Stack)
on a Raspberry Pi 3B. Handles three exposure phases with a single variable change.

## Hardware

- Raspberry Pi 3B — ARM Cortex-A53 64-bit, 1 GB RAM, 64 GB SD
- Raspberry Pi OS 64-bit (Bookworm)

## Phases

| `EXPOSE_MODE` | URL | Use case |
|---|---|---|
| `quick` | Random `*.trycloudflare.com` | First tests — no account needed |
| `cloudflare` | Stable Cloudflare subdomain | Ongoing dev/demo |
| `domain` | Your own domain + HTTPS | Production |

Changing phase = edit one line in `.env.pi` + `docker compose up -d`.

---

## First-time Setup

### 1. Prepare the OS

```bash
git clone https://github.com/RubenGZ/healthstack-pi-server.git
cd healthstack-pi-server
bash scripts/01-system.sh
sudo reboot
```

### 2. Install Docker

```bash
bash scripts/02-docker.sh
newgrp docker   # or log out and back in
```

### 3. Deploy (Quick Tunnel — no account needed)

```bash
bash scripts/03-deploy.sh
# Script will pause and ask you to fill in .env.pi and backend/.env
# Edit those files, then re-run:
bash scripts/03-deploy.sh
```

The Quick Tunnel URL appears in the cloudflared logs:

```bash
docker logs healthstack_tunnel_quick 2>&1 | grep trycloudflare
```

---

## Migrate to Cloudflare Named Tunnel (stable URL)

```bash
# 1. Get your token from https://one.dash.cloudflare.com → Zero Trust → Tunnels
bash scripts/04-cloudflare.sh   # shows the guide

# 2. Edit .env.pi
nano ~/health-stack/.env.pi
#   EXPOSE_MODE=cloudflare
#   CLOUDFLARE_TUNNEL_TOKEN=<paste token here>

# 3. Update ALLOWED_ORIGINS in backend/.env to match new URL

# 4. Restart
bash scripts/update.sh
```

---

## Migrate to Custom Domain

```bash
# 1. Buy domain, point DNS A record to your Pi's public IP
#    (or use Cloudflare DNS — set orange cloud on)

# 2. Edit .env.pi
nano ~/health-stack/.env.pi
#   EXPOSE_MODE=domain
#   DOMAIN=yourdomain.com

# 3. Edit backend/.env — update ALLOWED_ORIGINS=https://yourdomain.com

# 4. Restart — certbot will obtain certificate automatically
bash scripts/update.sh

# 5. First certificate (run once):
docker exec healthstack_certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com --email your@email.com --agree-tos --no-eff-email
```

---

## Update app

```bash
bash ~/healthstack-pi-server/scripts/update.sh
```

---

## Container overview

| Container | Always on | Profile |
|---|---|---|
| `healthstack_postgres` | yes | — |
| `healthstack_redis` | yes | — |
| `healthstack_backend` | yes | — |
| `healthstack_nginx` | yes | — |
| `healthstack_tunnel_quick` | no | `quick` |
| `healthstack_tunnel` | no | `cloudflare` |
| `healthstack_nginx_ssl` | no | `domain` |
| `healthstack_certbot` | no | `domain` |

## Memory budget (Pi 3B, 1 GB RAM)

| Service | ~RAM |
|---|---|
| Postgres | 150 MB |
| Redis | 50 MB |
| FastAPI | 150 MB |
| nginx | 10 MB |
| cloudflared | 30 MB |
| OS overhead | 200 MB |
| **Total** | **~590 MB** |

1 GB swap configured for safety headroom.
```

---

## Task 7: `.gitignore` and commit

**Files:**
- Create: `healthstack-pi-server/.gitignore`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
.env.pi
backend/.env
*.env
.env
```

- [ ] **Step 2: Commit all files**

```bash
cd healthstack-pi-server
git add .
git commit -m "feat: initial healthstack-pi-server ops repo

Full Raspberry Pi 3B deployment for HealthStack Pro.
Supports three exposure modes: quick (trycloudflare.com),
cloudflare (named tunnel), domain (Let's Encrypt).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push to GitHub**

```bash
git push -u origin main
```

---

## Task 8: Update Health_Stack `feat/pi-server` branch

**Files:**
- Modify: `Health_Stack/docker-compose.pi.yml` (add deprecation note)

- [ ] **Step 1: Add note to existing docker-compose.pi.yml**

Add at the top of `docker-compose.pi.yml` in Health_Stack:

```yaml
# NOTE: The canonical Pi compose file (with EXPOSE_MODE profiles) lives in:
# https://github.com/RubenGZ/healthstack-pi-server
# scripts/03-deploy.sh copies it here automatically during deploy.
# This file is kept as a fallback reference only.
```

- [ ] **Step 2: Commit and push feat/pi-server branch**

```bash
cd Health_Stack
git add docker-compose.pi.yml
git commit -m "docs: note that canonical Pi compose is in healthstack-pi-server

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push -u origin feat/pi-server
```

---

## Self-Review Checklist

- [x] Spec section "New Repo Structure" → Tasks 2–7 cover all files
- [x] Spec section "Exposure Modes" → docker-compose.pi.yml has all 3 profiles
- [x] Spec section "Memory Optimisations" → postgres command flags + redis maxmemory in Task 2
- [x] Spec section "Changes to Health_Stack on feat/pi-server" → Task 8
- [x] Spec section "Migration Path" → README + 04-cloudflare.sh cover quick→cloudflare→domain
- [x] No placeholders or TBDs
- [x] All script paths consistent (`~/health-stack/`, `~/healthstack-pi-server/`)
- [x] `.env.pi` variable names consistent across compose, templates, and scripts
