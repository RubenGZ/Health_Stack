#!/bin/bash
# =============================================================================
# setup-pi.sh — HealthStack Pro en Raspberry Pi
# Ejecutar una sola vez en una Pi limpia con Raspberry Pi OS 64-bit.
# =============================================================================

set -e

REPO_URL="${1:-}"
INSTALL_DIR="$HOME/healthstack"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "=========================================="
echo "  HealthStack Pro — Setup Raspberry Pi"
echo "=========================================="
echo ""

# ── 1. Dependencias del sistema ──────────────────────────────────────────────
info "Instalando dependencias del sistema..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
    curl git nodejs npm openssl

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Instalando Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    warn "Docker instalado. Si es la primera vez, cierra sesión y vuelve a entrar antes de continuar."
    warn "Luego vuelve a ejecutar: bash scripts/setup-pi.sh"
    exit 0
else
    info "Docker ya instalado: $(docker --version)"
fi

# ── 3. Clonar repo ────────────────────────────────────────────────────────────
if [ -z "$REPO_URL" ]; then
    warn "Pasa la URL del repo como argumento: bash setup-pi.sh https://github.com/tu/repo"
    warn "Asumiendo que ya estás dentro del directorio del repo..."
    INSTALL_DIR="$(pwd)"
else
    if [ ! -d "$INSTALL_DIR" ]; then
        info "Clonando repositorio..."
        git clone "$REPO_URL" "$INSTALL_DIR"
    else
        info "Repo ya existe, actualizando..."
        git -C "$INSTALL_DIR" pull
    fi
    cd "$INSTALL_DIR"
fi

# ── 4. Compilar landing (Vite) ────────────────────────────────────────────────
info "Compilando landing page..."
cd landing
npm ci --silent
npm run build
cd ..
info "Landing compilada en landing/dist/"

# ── 5. Crear .env si no existe ────────────────────────────────────────────────
if [ ! -f backend/.env ]; then
    info "Generando backend/.env con valores por defecto..."

    POSTGRES_PASS=$(openssl rand -hex 16)
    REDIS_PASS=$(openssl rand -hex 16)
    MASTER_KEY=$(openssl rand -hex 32)

    # Generar par de claves RSA para JWT
    openssl genrsa -out /tmp/jwt_private.pem 2048 2>/dev/null
    openssl rsa -in /tmp/jwt_private.pem -pubout -out /tmp/jwt_public.pem 2>/dev/null
    JWT_PRIVATE=$(awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' /tmp/jwt_private.pem)
    JWT_PUBLIC=$(awk  'NF {sub(/\r/, ""); printf "%s\\n",$0;}' /tmp/jwt_public.pem)
    rm -f /tmp/jwt_private.pem /tmp/jwt_public.pem

    cat > backend/.env << EOF
APP_ENV=production
DEBUG=false

# Base de datos (el docker-compose sobreescribe DATABASE_URL con el nombre del servicio)
DATABASE_URL=postgresql+asyncpg://postgres:${POSTGRES_PASS}@postgres:5432/healthstack
DATABASE_SYNC_URL=postgresql://postgres:${POSTGRES_PASS}@postgres:5432/healthstack

# Contraseñas generadas automáticamente — GUÁRDALAS EN UN LUGAR SEGURO
POSTGRES_PASSWORD=${POSTGRES_PASS}
REDIS_PASSWORD=${REDIS_PASS}

# Cifrado de datos biométricos (AES-256) — NO CAMBIAR después del primer arranque
HEALTH_LINK_MASTER_KEY=${MASTER_KEY}

# JWT RSA-256
JWT_PRIVATE_KEY_PEM=${JWT_PRIVATE}
JWT_PUBLIC_KEY_PEM=${JWT_PUBLIC}
JWT_ALGORITHM=RS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS — añade tu dominio de Cloudflare cuando lo tengas
ALLOWED_ORIGINS=https://TU-SUBDOMINIO.pages.dev

# Cloudflare Tunnel token — obtenerlo en: https://one.dash.cloudflare.com
CLOUDFLARE_TUNNEL_TOKEN=PEGA_TU_TOKEN_AQUI

# Sentry (opcional)
SENTRY_DSN=
EOF

    info ".env creado en backend/.env"
    warn ""
    warn "IMPORTANTE: Abre backend/.env y:"
    warn "  1. Copia CLOUDFLARE_TUNNEL_TOKEN desde dash.cloudflare.com"
    warn "  2. Actualiza ALLOWED_ORIGINS con tu dominio Cloudflare"
    warn ""
    warn "Contraseñas generadas (guárdalas):"
    warn "  POSTGRES_PASSWORD = ${POSTGRES_PASS}"
    warn "  REDIS_PASSWORD    = ${REDIS_PASS}"
    warn "  MASTER_KEY        = ${MASTER_KEY}"
    echo ""
    read -p "Presiona ENTER cuando hayas configurado el .env para continuar..."
fi

# ── 6. Arrancar stack ─────────────────────────────────────────────────────────
info "Arrancando stack con Docker Compose..."
docker compose -f docker-compose.pi.yml up -d --build

# ── 7. Verificar health check ─────────────────────────────────────────────────
info "Esperando que la API arranque..."
sleep 10

for i in {1..12}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health 2>/dev/null || echo "000")
    if [ "$STATUS" = "200" ]; then
        info "API respondiendo en http://localhost/health"
        break
    fi
    echo "  Intento $i/12 — status: $STATUS"
    sleep 5
done

if [ "$STATUS" != "200" ]; then
    warn "La API no responde todavía. Revisa los logs:"
    warn "  docker compose -f docker-compose.pi.yml logs backend"
fi

# ── 8. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Setup completado"
echo "=========================================="
echo ""
echo "  Local:    http://localhost"
echo "  Internet: https://TU-DOMINIO.cloudflare.com (cuando configures el tunnel)"
echo ""
echo "  Comandos útiles:"
echo "    docker compose -f docker-compose.pi.yml logs -f"
echo "    docker compose -f docker-compose.pi.yml ps"
echo "    docker compose -f docker-compose.pi.yml restart backend"
echo "    curl http://localhost/health"
echo ""
echo "  Para actualizar el código:"
echo "    git pull && docker compose -f docker-compose.pi.yml up -d --build backend"
echo ""
