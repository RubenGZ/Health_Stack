# Cómo usar Swagger — HealthStack Pro

**URL:** http://localhost:8000/docs
> El backend tiene que estar corriendo — ejecuta `DEV.bat` o `make dev` primero.

URLs de desarrollo:
| Servicio | URL |
|----------|-----|
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Landing (React) | http://localhost:5174 |
| App (vanilla JS) | http://localhost:3000 |

---

## Paso 1 — Crear una cuenta

1. Busca el apartado **identity** en la página
2. Haz clic en `POST /api/v1/auth/register` → **Try it out**
3. En el Request body:
```json
{
  "email": "tu@email.com",
  "password": "TuPassword123",
  "username": "tunombre"
}
```
4. Clic en **Execute** → respuesta `201` = cuenta creada

---

## Paso 2 — Login y obtener token

1. `POST /api/v1/auth/login` → Try it out
```json
{
  "email": "tu@email.com",
  "password": "TuPassword123"
}
```
2. De la respuesta, copia el valor de `access_token` (el texto largo)

---

## Paso 3 — Autenticarte en Swagger

1. Clic en **Authorize** (arriba a la derecha, icono de candado)
2. Pega el `access_token`
3. Clic en **Authorize** → **Close**

El token dura 30 minutos — si expira repite los pasos 2 y 3.

---

## Módulos disponibles

| Módulo | Descripción |
|--------|-------------|
| `identity` | registro, login, perfil |
| `health` | registros de peso y biométricos |
| `routines` | rutinas de ejercicio |
| `community` | posts y likes |
| `gamification` | XP, niveles, racha |
| `nutrition` | suplementos e ingredientes |
| `ai_coach` | coach de entrenamiento (Groq) |
| `ai_insights` | narrador de biomarcadores (Groq) |

---

## Códigos de respuesta

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado correctamente |
| 400 | Error en los datos enviados |
| 401 | No autenticado — repite paso 2 y 3 |
| 403 | Sin permisos |
| 404 | No encontrado |
| 422 | Formato incorrecto en el JSON |
| 429 | Rate limit — espera un momento |
| 500 | Error interno del servidor |

---

## Ejemplo completo — Registrar peso

```
POST /api/v1/health/records
{
  "weight_kg": 75.5,
  "notes": "Por la mañana en ayunas"
}
→ 201

GET /api/v1/health/records
→ 200 con el listado
```
