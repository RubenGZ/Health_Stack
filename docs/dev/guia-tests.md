# Guía de Tests — HealthStack Pro

> **Resumen en una línea:** Docker abierto en fondo → doble clic `TESTS.bat` → pulsa `2`

---

## Setup inicial (solo una vez)

```bash
# 1. Abre terminal dentro de la carpeta backend
cd backend

# 2. Crea el entorno virtual
python -m venv .venv

# 3. Instala dependencias
.venv\Scripts\pip install -r requirements.txt
```

---

## Cada vez que quieras testear

1. Abre **Docker Desktop** y espera a que diga "Engine running"
   *(Solo en segundo plano — no hagas nada más en él)*
2. Doble clic en **`TESTS.bat`** en la raíz del proyecto
3. Si aparece `PostgreSQL OFF` en rojo → pulsa `5` para arrancarlo
4. Pulsa `2` para correr todos los tests

---

## Primera vez con el launcher

Después del setup, haz esto en orden:

- `5` + Enter → arranca la base de datos (espera "PostgreSQL listo")
- `8` + Enter → crea la BD de test (solo la primera vez)

---

## Opciones del menú

| Tecla | Acción |
|-------|--------|
| `1` | Elegir módulo concreto (auth, health, routines...) |
| `2` | Correr **todos** los tests |
| `3` | Re-correr solo los que fallaron |
| `4` | Buscar test por nombre |
| `5` | Arrancar PostgreSQL (Docker) |
| `6` | Arrancar API en modo desarrollo (localhost:8000) |
| `7` | Abrir Swagger en el navegador |
| `8` | Crear BD de test (solo una vez) |
| `9` | Aplicar migraciones Alembic |
| `0` | Seed de datos de ejemplo |
| `s` | Estado del sistema |
| `q` | Salir |

---

## Problemas comunes

| Problema | Solución |
|----------|----------|
| No encuentra `TESTS.bat` | Está en la raíz del proyecto, no en Docker Desktop |
| "No se encontró el entorno virtual" | Hacer el setup inicial de arriba |
| `PostgreSQL OFF` al pulsar 5 da error | Abrir Docker Desktop primero |
| Errores de "connection refused" | PostgreSQL no está corriendo → pulsa `5` |
| Ventana se cierra sola | Abrir terminal y ejecutar: `python test_launcher.py` |

---

## CLI directo (sin TESTS.bat)

```bash
python test_launcher.py all
python test_launcher.py auth
python test_launcher.py health
python test_launcher.py failed
python test_launcher.py status
```

---

## Estado actual: 90/90 tests pasando

```
tests/unit/              16 tests
tests/integration/
  test_auth.py           10 tests
  test_health.py          9 tests
  test_routines.py        6 tests
  test_community.py       6 tests
  test_gamification.py    7 tests
  test_nutrition.py       5 tests
  test_ai_coach.py        9 tests
  test_ai_insights.py     9 tests
```
