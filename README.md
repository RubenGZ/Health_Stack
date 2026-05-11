# HealthStack Pro

App de salud personal con seguimiento biométrico, IA nutricional, rutinas de ejercicio y gamificación.

**Stack:** FastAPI + PostgreSQL · React/Vite (landing) · Vanilla JS SPA · Raspberry Pi ready

---

## Inicio rápido

```bash
# Desarrollo local (todo en Docker)
make dev          # o doble clic en DEV.bat

# Tests
make test         # o doble clic en TESTS.bat

# Landing (React)
cd landing && npm run dev   # → http://localhost:5174

# App principal
npx serve frontend          # → http://localhost:3000
```

---

## Estructura del proyecto

```
healthstack-pro/
├── backend/          API FastAPI + PostgreSQL (8 módulos)
├── frontend/         SPA vanilla JS (app principal)
├── landing/          Landing page React + Vite + Tailwind
├── frontend-mobile/  PWA móvil React
├── nginx/            Configuraciones Nginx (dev, prod, Pi)
├── scripts/          Scripts de setup e infraestructura
├── docs/             Toda la documentación →  ver docs/README.md
├── docker-compose.yml          Desarrollo local
├── docker-compose.pi.yml       Raspberry Pi
├── docker-compose.prod.yml     Producción
└── Makefile                    Comandos rápidos
```

---

## Documentación

Ver [`docs/README.md`](docs/README.md) para el índice completo.

Accesos directos:
- [Arquitectura](docs/architecture/overview.html)
- [Guía Raspberry Pi](docs/infrastructure/raspberry-pi.md)
- [Guía API / Swagger](docs/dev/guia-api.md)
- [Guía de Tests](docs/dev/guia-tests.md)
- [Estrategia SEO](docs/seo/estrategia.html)

---

## Módulos del backend

| Módulo | Descripción | Auth |
|--------|-------------|------|
| identity | Registro, login, refresh, perfil | JWT RS256 |
| health | Registros biométricos cifrados | JWT + AES-256 |
| nutrition | Recetas, ingredientes, suplementos | UUID local |
| routines | Rutinas de ejercicio | JWT |
| community | Posts + likes | JWT |
| gamification | XP, niveles, racha | JWT |
| ai_coach | Coach intra-sesión | JWT + Groq |
| ai_insights | Narrador biomarcadores y riesgo | JWT + Groq |
| chat | Chatbot wizard | Público |

---

## Variables de entorno

Copia `backend/.env.example` → `backend/.env` y rellena los valores.

Para la Pi usa `.env.pi.example` o ejecuta `scripts/setup-pi.sh`.

---

## Tests

90 tests pasando. Requiere Docker corriendo con PostgreSQL.

```bash
python test_launcher.py all    # todos
python test_launcher.py auth   # módulo concreto
python test_launcher.py failed # solo los que fallaron
```
