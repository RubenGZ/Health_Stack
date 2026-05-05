# Design: healthstack-pi-server — Raspberry Pi Deployment Repo

**Date:** 2026-05-05  
**Status:** Approved  
**Author:** Brainstormed with Claude

---

## Context

Health_Stack is a FastAPI + PostgreSQL + vanilla JS + React/Vite app hosted at
`github.com/RubenGZ/Health_Stack`. The goal is to run it publicly on a Raspberry Pi 3B
using Cloudflare Tunnel for testing, with a clean migration path to a custom domain.

---

## Hardware

| Item | Spec |
|------|------|
| Model | Raspberry Pi 3B |
| CPU | ARM Cortex-A53 64-bit (ARMv8) |
| RAM | 1 GB |
| Storage | 64 GB SD card |
| Network | 802.11n WiFi + 100 Mbps Ethernet |
| OS | Raspberry Pi OS 64-bit (Bookworm) — to be installed |

---

## Architecture

Two separate repos on GitHub under `RubenGZ`:

```
github.com/RubenGZ/Health_Stack          ← application code (unchanged on master)
github.com/RubenGZ/healthstack-pi-server ← ops/infra companion (new)
```

On the Pi:

```
~/health-stack/          ← cloned from Health_Stack
~/healthstack-pi-server/ ← cloned from healthstack-pi-server
```

`03-deploy.sh` copies `docker-compose.pi.yml` and `nginx/` from the ops repo into
`~/health-stack/` before launching, because Docker Compose needs to run from inside
Health_Stack to resolve `./frontend` and `./landing/dist` volume mounts.

---

## New Repo Structure: `healthstack-pi-server`

```
healthstack-pi-server/
├── README.md
├── scripts/
│   ├── 01-system.sh        ← OS update, 1 GB swap, GPU split 16 MB
│   ├── 02-docker.sh        ← Docker Engine + Compose plugin (arm64)
│   ├── 03-deploy.sh        ← Clone repos, copy configs, build & launch
│   ├── 04-cloudflare.sh    ← Create / verify Cloudflare Tunnel
│   └── update.sh           ← git pull + docker compose restart
├── templates/
│   ├── .env.pi.example     ← EXPOSE_MODE, POSTGRES_PASSWORD, REDIS_PASSWORD,
│   │                          CLOUDFLARE_TUNNEL_TOKEN
│   └── backend.env.example ← JWT_PRIVATE_KEY_PEM, JWT_PUBLIC_KEY_PEM,
│                              HEALTH_LINK_MASTER_KEY, ALLOWED_ORIGINS
├── nginx/
│   ├── nginx.cloudflare.conf  ← HTTP only; Cloudflare handles TLS
│   └── nginx.domain.conf      ← HTTPS + Let's Encrypt (phase 2)
└── docker-compose.pi.yml   ← Compose with Docker profiles
```

---

## Exposure Modes (`EXPOSE_MODE`)

One variable in `.env.pi` controls which services run. Migrating between phases
requires only changing this value and running `docker compose up -d`.

| `EXPOSE_MODE` | Phase | Behaviour |
|---|---|---|
| `quick` | First tests | Cloudflare Quick Tunnel — random `*.trycloudflare.com` URL, **no account needed** |
| `cloudflare` | Stable tests | Cloudflare Named Tunnel — fixed URL via `CLOUDFLARE_TUNNEL_TOKEN` |
| `domain` | Production | nginx HTTPS + Let's Encrypt certbot, no cloudflared |

### Docker Compose profiles

```yaml
services:
  postgres:   # always on
  redis:      # always on
  backend:    # always on
  nginx:      # always on — mounts nginx.cloudflare.conf for quick/cloudflare,
              #              nginx.domain.conf for domain
  cloudflared:
    profiles: ["quick", "cloudflare"]
    # quick:      command: tunnel --url http://nginx:80
    # cloudflare: command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
  certbot:
    profiles: ["domain"]
```

---

## Memory Optimisations for Pi 3B / 1 GB RAM

Configured in `01-system.sh` and via Docker Compose environment variables:

| Component | Setting | Value |
|---|---|---|
| OS | Swap | 1 GB (dphys-swapfile) |
| OS | GPU memory split | 16 MB (headless) |
| PostgreSQL | `shared_buffers` | 128 MB |
| PostgreSQL | `max_connections` | 50 |
| Redis | `maxmemory` | 128 MB |
| Redis | `maxmemory-policy` | allkeys-lru |

Expected RAM usage at rest: ~650–700 MB (within 1 GB + swap headroom).

---

## Changes to `Health_Stack` repo

All changes go on branch `feat/pi-server`, never directly to `master`.

Minimal changes expected:
- Update `docker-compose.pi.yml` to support `EXPOSE_MODE` profiles (currently
  only has `cloudflare` hardcoded)
- Add `nginx/nginx.domain.conf` for phase 2

---

## Migration Path

```
EXPOSE_MODE=quick
    ↓  (edit .env.pi + docker compose up -d)
EXPOSE_MODE=cloudflare    (register tunnel at one.dash.cloudflare.com)
    ↓  (edit .env.pi + docker compose up -d + update ALLOWED_ORIGINS)
EXPOSE_MODE=domain        (buy domain, configure DNS, run certbot)
```

---

## Out of Scope

- CI/CD for the ops repo (manual deploy is sufficient for a single Pi)
- Monitoring / alerting (Prometheus not wired yet in Health_Stack)
- Automatic certificate renewal UI (certbot renew runs via cron on the host)
- Multi-Pi or load balancing
