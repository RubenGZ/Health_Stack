# Sistema de Rankeds + Gym Servers — Design Spec

> **Para agentes:** implementar con `superpowers:subagent-driven-development`.
> Plan en `docs/superpowers/plans/2026-05-15-ranked-system.md`

**Objetivo:** Sistema de ranking competitivo con dos colas (Normal / Competitivo), tiers
con nomenclatura propia de gym, servidores de gimnasio con leaderboard interno, insignias
de campeón que dan acceso a ligas geográficas (ciudad → provincia → nacional → mundial).

**Stack:** FastAPI + SQLAlchemy 2.0 async, PostgreSQL 17, vanilla JS.

---

## 1. Dos colas — filosofía diferente

| | Cola Normal | Cola Competitivo |
|---|---|---|
| **Objetivo** | Celebrar la constancia y el hábito | Medir rendimiento puro |
| **Fuente de LP** | Sesiones loggeadas, racha días, variedad muscular | Volumen total, PRs de 1RM, tasa de progresión |
| **Desempate** | Días activos en la temporada | 1RM estimado acumulado |
| **Nombres de tier** | Journey (ver §2) | Performance (ver §2) |
| **Acceso** | Abierto a todos | Requiere llegar a **Comprometido** en Normal |
| **Decaimiento** | LP decae si no hay sesión en 14 días | LP decae si no hay sesión en 7 días |

---

## 2. Tiers y divisiones

Cada tier tiene **4 divisiones** (IV → III → II → I). La división I con 100 LP → promoción al siguiente tier.
El tier máximo (Leyenda / Apex) es sin divisiones — LP puro, aparece en leaderboard global.

### Cola Normal — "El Viaje"

| # | Tier | Descripción |
|---|------|-------------|
| 1 | **Novato** | Acaba de llegar. Primeras sesiones, todo es nuevo. |
| 2 | **Regular** | Ya tiene una rutina. Aparece más días de los que falla. |
| 3 | **Constante** | Los hábitos están asentados. No hay excusas. |
| 4 | **Comprometido** | El gym es parte de su identidad. Raramente falta. |
| 5 | **Veterano** | Años en el gym. Conoce los ciclos, respeta el proceso. |
| 6 | **Forjado** | Ha pasado por baches y vuelto. El esfuerzo se nota. |
| 7 | **Élite** | Top nacional en constancia. Referente para otros. |
| 8 | **Leyenda** *(sin divisiones)* | Presencia absoluta. La gente le pregunta consejos. |

**Desbloqueo Competitivo:** al llegar a **Comprometido IV** por primera vez.

### Cola Competitivo — "El Rendimiento"

| # | Tier | Descripción |
|---|------|-------------|
| 1 | **Calentando** | Conoce el camino pero está encontrando sus números. |
| 2 | **Amateur** | Entrena en serio. Los progresos son reales. |
| 3 | **Semipro** | Nivel de competición amateur. Los PRs sorprenden. |
| 4 | **Bestia** | Números que hacen girar cabezas en el gym. |
| 5 | **Titán** | Fuerza sobrehumana relativa a su categoría. |
| 6 | **Fenómeno** | Excepción estadística. Progresión constante en todos los planos. |
| 7 | **Invicto** | No ha perdido una semana de volumen en la temporada. |
| 8 | **Apex** *(sin divisiones)* | El pico absoluto. Solo los mejores de cada ciudad. |

---

## 3. Motor de LP

### Cola Normal — LP por consistencia

| Evento | LP |
|--------|----|
| Sesión completada (cualquier músculo) | +8 |
| Sesión con ≥ 3 grupos musculares distintos | +4 bonus |
| Racha de 3 días activos en la semana | +12 |
| Racha de 7 días activos en la semana | +20 |
| Primera sesión de la semana (lunes-domingo) | +5 |
| 14 días sin sesión | −15 / semana |

Tope de LP ganado por sesión: **20 LP** (anti-spam).

### Cola Competitivo — LP por rendimiento puro

| Evento | LP |
|--------|----|
| PR de 1RM estimado en cualquier ejercicio | +15 por PR |
| Volumen total sesión > media personal | +10 |
| Volumen total sesión > media personal × 1.2 | +18 (reemplaza al anterior) |
| Tasa de progresión ≥ 2.5% respecto a la semana anterior | +12 |
| 7 días sin sesión | −20 / semana |

**No hay LP por racha ni por variedad.** Solo números.

### Promoción / Descenso

- **Promoción:** 100 LP en división I → pasa a siguiente tier div IV con 0 LP.
- **Descenso:** 0 LP en división IV → baja a tier anterior div I con 75 LP.
- **Zona de seguridad:** al ascender a un tier nuevo, las primeras 48h son inmunes a descenso.
- **Apex / Leyenda:** LP sigue acumulando pero no hay promoción — aparece en leaderboard ordenado por LP.

### Temporadas

- Duración: **13 semanas** (trimestral). La temporada 1 comienza al lanzamiento.
- Soft reset al inicio de cada temporada:
  - Guardar `peak_tier` + `peak_division` de la temporada anterior.
  - Bajar **3 divisiones** (si estás en Forjado II → queda en Comprometido III).
  - LP a 0 en la nueva división.
  - Los jugadores en Novato o Calentando quedan en el mismo tier con 0 LP.

---

## 4. Gym Servers — Comunidad de Gimnasio

### Concepto

Un usuario puede crear un **servidor de gimnasio** (como un Discord, pero para el gym).
Los miembros del mismo gym compiten entre sí en el leaderboard interno. Los **top 3** del gym
al final de cada temporada reciben la **Insignia de Campeón del Gimnasio**, que les da acceso
a las ligas geográficas.

### Jerarquía de ligas geográficas

```
Gym Server
  └─ Liga Ciudad        (requiere Insignia de Campeón del gym)
       └─ Liga Provincia  (top 10% de ciudad al cierre de temporada)
            └─ Liga Comunidad Autónoma
                 └─ Liga Nacional
                      └─ Liga Europea
                           └─ Liga Mundial
```

Cada ascenso geográfico requiere terminar en el top % de la liga inferior al cierre
de temporada. El sistema es opt-in: el usuario decide si participar en las ligas
geográficas e introduce su ciudad (una sola vez, editable en perfil).

### Insignia de Campeón

- Aspecto: ícono de pesa dorado/plateado/bronce según posición (1º/2º/3º).
- Se muestra en el perfil del usuario durante la temporada siguiente.
- Permite aparecer en el leaderboard de ciudad aunque no estés en top 3 del gym —
  la insignia es el "pase" de acceso, pero el LP de la cola Competitivo determina tu posición.

---

## 5. Modelo de datos (backend)

### RankedProfile

```python
class RankedProfile(Base):
    __tablename__ = 'ranked_profiles'
    __table_args__ = (
        UniqueConstraint('user_id', 'queue'),
        {'schema': 'public'},
    )
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False, index=True)
    queue      = Column(String(20), nullable=False)   # 'normal' | 'competitive'
    season     = Column(Integer, nullable=False, default=1)
    tier       = Column(String(20), nullable=False)   # 'novato' | 'regular' | ... | 'leyenda'
                                                      # 'calentando' | 'amateur' | ... | 'apex'
    division   = Column(Integer, nullable=False, default=4)   # 1-4; null en tier máximo
    lp         = Column(Integer, nullable=False, default=0)
    peak_tier  = Column(String(20), nullable=False, default='novato')
    peak_div   = Column(Integer, nullable=True)
    prev_season_tier = Column(String(20), nullable=True)
    lp_week    = Column(Integer, nullable=False, default=0)   # LP ganado esta semana (anti-spam)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

### RankedEvent

```python
class RankedEvent(Base):
    __tablename__ = 'ranked_events'
    __table_args__ = {'schema': 'public'}
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False, index=True)
    queue      = Column(String(20), nullable=False)
    season     = Column(Integer, nullable=False)
    event_type = Column(String(30), nullable=False)
    # event_type: 'session_lp' | 'pr_lp' | 'volume_lp' | 'streak_lp' |
    #             'decay' | 'promotion' | 'demotion' | 'season_reset'
    lp_delta   = Column(Integer, nullable=False)
    lp_after   = Column(Integer, nullable=False)
    tier_after = Column(String(20), nullable=False)
    div_after  = Column(Integer, nullable=True)
    meta       = Column(JSONB, nullable=True)   # { exercise_key, old_1rm, new_1rm, ... }
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

### GymServer

```python
class GymServer(Base):
    __tablename__ = 'gym_servers'
    __table_args__ = {'schema': 'public'}
    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(80), nullable=False)
    description = Column(Text, nullable=True)
    created_by  = Column(UUID(as_uuid=True), ForeignKey('public.users.id'), nullable=False)
    city        = Column(String(80), nullable=True)
    province    = Column(String(80), nullable=True)
    country     = Column(String(5), nullable=False, default='ES')   # ISO 3166-1 alpha-2
    invite_code = Column(String(10), nullable=False, unique=True)   # random 8-char, auto-gen
    is_public   = Column(Boolean, default=True, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
```

### GymMembership

```python
class GymMembership(Base):
    __tablename__ = 'gym_memberships'
    __table_args__ = (
        UniqueConstraint('user_id', 'gym_id'),
        {'schema': 'public'},
    )
    id       = Column(Integer, primary_key=True, autoincrement=True)
    user_id  = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False, index=True)
    gym_id   = Column(Integer, ForeignKey('public.gym_servers.id', ondelete='CASCADE'), nullable=False, index=True)
    role     = Column(String(10), nullable=False, default='member')  # 'member'|'admin'|'owner'
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
```

### GymChampionBadge

```python
class GymChampionBadge(Base):
    __tablename__ = 'gym_champion_badges'
    __table_args__ = {'schema': 'public'}
    id        = Column(Integer, primary_key=True, autoincrement=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False, index=True)
    gym_id    = Column(Integer, ForeignKey('public.gym_servers.id', ondelete='CASCADE'), nullable=False)
    season    = Column(Integer, nullable=False)
    position  = Column(Integer, nullable=False)   # 1, 2, o 3
    queue     = Column(String(20), nullable=False)  # 'competitive' (las insignias son del competitivo)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())
```

---

## 6. API backend

### Módulo: `backend/app/modules/ranked/`

#### POST /api/ranked/update-lp
Llamado internamente por workout_sessions/service.py tras guardar sesión.
No es público — solo el servicio de sesiones lo llama directamente.

```json
{
  "user_id": "uuid",
  "session_data": {
    "total_volume_kg": 1620.0,
    "personal_avg_volume": 1400.0,
    "muscle_groups": ["chest", "triceps", "shoulders"],
    "prs": [{ "exercise_key": "press_banca_plano", "old_1rm": 98.5, "new_1rm": 103.2 }],
    "streak_days": 4
  }
}
```

Response: `{ "normal": { "lp_delta": +20, "tier": "comprometido", "div": 3 }, "competitive": { ... } }`

#### GET /api/ranked/profile
LP actual del usuario en ambas colas. Requiere JWT.

```json
{
  "normal": { "tier": "comprometido", "division": 3, "lp": 64, "peak_tier": "comprometido", "season": 1 },
  "competitive": { "tier": "semipro", "division": 2, "lp": 41, "unlocked": true }
}
```

#### GET /api/ranked/leaderboard?queue=competitive&scope=gym&gym_id=7
Leaderboard paginado. `scope`: `gym | city | province | national | global`.
`city` y superiores requieren que el usuario tenga `GymChampionBadge` en la temporada actual.

```json
{
  "scope": "gym",
  "gym_id": 7,
  "season": 1,
  "entries": [
    { "rank": 1, "username": "ruben_lifts", "tier": "bestia", "division": 1, "lp": 94, "badge": "gold" },
    { "rank": 2, "username": "maria_fitness", "tier": "semipro", "division": 1, "lp": 87, "badge": "silver" }
  ],
  "my_rank": 3,
  "total": 24
}
```

#### GET /api/ranked/events?queue=normal&limit=20
Historial de eventos LP del usuario. Para la pantalla "Cómo conseguí este LP".

#### GET /api/ranked/history?queue=normal
LP y tier a lo largo del tiempo. Para gráfico de progresión.

### Módulo: `backend/app/modules/gym_servers/`

#### POST /api/gym-servers
Crear gym server. Requiere JWT. `invite_code` se genera automáticamente (8 chars alfanumérico).

#### POST /api/gym-servers/join
Unirse por `invite_code` o `gym_id` (si is_public). Requiere JWT.

#### GET /api/gym-servers/{gym_id}
Info del gym + lista de miembros con sus tiers.

#### GET /api/gym-servers/my-gyms
Gyms en los que está el usuario autenticado.

#### GET /api/gym-servers/{gym_id}/leaderboard
Ranking interno del gym para la temporada actual.

---

## 7. Lógica de temporadas y cierre

Al cierre de temporada (job programado, cron semanal que verifica fecha):

1. Calcular top 3 de cada gym en cola Competitivo → emitir `GymChampionBadge`.
2. Calcular top 10% de cada ciudad → actualizar `city_league_eligible = True` en `GymChampionBadge`.
3. Aplicar soft reset a todos los `RankedProfile`: bajar 3 divisiones, lp = 0, incrementar season.
4. Emitir `RankedEvent` con `event_type='season_reset'` para cada usuario.
5. Crear nueva temporada en tabla `ranked_seasons` (id, start_date, end_date, season_number).

```python
class RankedSeason(Base):
    __tablename__ = 'ranked_seasons'
    id           = Column(Integer, primary_key=True, autoincrement=True)
    season       = Column(Integer, nullable=False, unique=True)
    start_date   = Column(Date, nullable=False)
    end_date     = Column(Date, nullable=False)
    closed       = Column(Boolean, default=False, nullable=False)
```

El servicio de LP consulta la temporada activa para saber en qué `season` estampar los eventos.

---

## 8. Frontend — ranked.js

### Panel de Rankeds (en el dashboard)

```
┌─ Cola Normal: Comprometido III ──────────────────────────────┐
│  ████████████████░░░  64 / 100 LP                            │
│  Siguiente: Comprometido II                                  │
│  Esta semana: +28 LP  |  Racha: 4 días                       │
│  [Ver historial LP]   [Ver leaderboard del gym]              │
└──────────────────────────────────────────────────────────────┘

┌─ Cola Competitivo: Semipro II ───────────────────────────────┐
│  ████████░░░░░░░░░░░  41 / 100 LP                            │
│  Siguiente: Semipro I                                        │
│  Mejor 1RM esta sem: Press banca 103.2 kg (+4.7)             │
│  [Ver leaderboard competitivo]                               │
└──────────────────────────────────────────────────────────────┘
```

### Leaderboard de gym

Tabla con avatar placeholder, username, tier badge coloreado, LP, días activos esta temporada.
Si el usuario está en el top 3, se muestra la insignia (pesa 🥇🥈🥉).

### Panel de Gym Server

```
┌─ Tu Gym: CrossFit Vallecas ──────────────────────────────────┐
│  24 miembros  |  Código: ABC12345  |  Temporada 1            │
│                                                              │
│  🥇 ruben_lifts        Bestia I    94 LP                     │
│  🥈 maria_fitness      Semipro I   87 LP                     │
│  🥉 carlos_gains       Semipro II  74 LP                     │
│  4. pepito_iron        Amateur III 61 LP   ← Tú              │
│  ...                                                         │
│  [Invitar amigos]  [Ver liga ciudad]                         │
└──────────────────────────────────────────────────────────────┘
```

### Ligas geográficas (si tiene insignia)

Selector: `Mi Gym | Madrid | Comunidad de Madrid | España | Europa | Mundial`
Cada liga muestra top 50. El usuario aparece con su posición aunque no esté en top 50.

---

## 9. Integración con gamificación existente

Los rankeds son un sistema paralelo a la gamificación (XP + niveles). No se reemplazan:

- **Gamificación:** XP + niveles + badges genéricos — refleja participación general en la app.
- **Rankeds:** LP + tiers — refleja dedicación al entrenamiento y rendimiento.

Cuando el usuario sube de tier, se emite adicionalmente una acción de gamificación:

```python
# En ranked/service.py, al detectar promoción:
if promoted:
    await gamification_service.award_xp(user_id, action='ranked_promotion', xp=50)
```

Añadir `'ranked_promotion': 50` a `XP_TABLE` en gamification/models.py.

---

## 10. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `backend/app/modules/ranked/models.py` | Nuevo — RankedProfile, RankedEvent, RankedSeason |
| `backend/app/modules/ranked/schemas.py` | Nuevo — Pydantic schemas |
| `backend/app/modules/ranked/service.py` | Nuevo — motor LP, promociones, resets, PRs |
| `backend/app/modules/ranked/repository.py` | Nuevo — queries leaderboard, perfil, eventos |
| `backend/app/modules/ranked/router.py` | Nuevo — endpoints /api/ranked/* |
| `backend/app/modules/gym_servers/models.py` | Nuevo — GymServer, GymMembership, GymChampionBadge |
| `backend/app/modules/gym_servers/schemas.py` | Nuevo — Pydantic schemas |
| `backend/app/modules/gym_servers/service.py` | Nuevo — crear gym, join, cálculo top 3 |
| `backend/app/modules/gym_servers/router.py` | Nuevo — endpoints /api/gym-servers/* |
| `backend/app/modules/gamification/models.py` | Añadir 'ranked_promotion': 50 a XP_TABLE |
| `backend/app/modules/gamification/schemas.py` | Añadir 'ranked_promotion' al Literal |
| `backend/app/main.py` | Registrar routers ranked + gym_servers |
| `alembic/versions/` | 2 migraciones: ranked tables + gym_server tables |
| `frontend/js/ranked.js` | Nuevo — panel ranked + leaderboard + gym server UI |
| `frontend/index.html` | Añadir sección #ranked-section |
| `tests/integration/test_ranked.py` | Tests de integración |
| `tests/integration/test_gym_servers.py` | Tests de integración |

---

## 11. Capa social y descubrimiento

### Filosofía

El gym server no es solo una tabla de clasificación — es un punto de encuentro entre personas
que comparten nivel y estilo de entrenamiento. El ranking da contexto ("entrena con alguien
de tu mismo tier"), pero el objetivo final es que la gente se conozca, se motive y permanezca
en la app.

### Perfil de entrenamiento público (opt-in)

El usuario puede activar un perfil visible dentro de su gym server (desactivado por defecto).
Campos visibles si se activa:

```
username        • Tier (Normal + Competitivo)  • Días activos esta temporada
Ejercicios favoritos (top 3 por frecuencia)     • Horario habitual (mañana/tarde/noche)
Objetivo personal (fuerza / volumen / salud)    • Gym server(s) en los que está
```

Nunca se muestra edad, ciudad exacta ni ningún dato de salud biométrico — solo datos de
entrenamiento que el usuario ha generado en el workout logger.

### Búsqueda de compañero de entrenamiento ("Buscar Sparring")

Dentro de un gym server, botón "Buscar Sparring":

- **Filtros:** rango de tier (±1 tier del usuario), días disponibles, objetivo.
- **Resultado:** tarjetas de otros miembros del gym con perfil público activado.
- **Acción:** botón "Conectar" envía una notificación in-app al otro usuario.
- **Conexión aceptada:** ambos aparecen en la lista de "Sparrings" del perfil.

No hay chat propio en la app (fase A) — al conectar se muestra un campo de contacto
opcional que el otro usuario puede haber rellenado (Instagram, email, Telegram).

### Desafíos de gym ("Reto de Gym")

Un admin del gym server puede crear un reto colectivo con objetivo medible:

```
Reto: "Mayo brutal" — 200 sesiones como gym en mayo
Progreso: 47 / 200 sesiones  •  14 miembros participando
Recompensa: Insignia especial de temporada para todos los que contribuyan ≥ 3 sesiones
```

Los retos crean sentido de comunidad y empujan la retención. La mecánica es simple:
se suman sesiones loggeadas por miembros del gym que tienen el reto activo.

```python
class GymChallenge(Base):
    __tablename__ = 'gym_challenges'
    __table_args__ = {'schema': 'public'}
    id           = Column(Integer, primary_key=True, autoincrement=True)
    gym_id       = Column(Integer, ForeignKey('public.gym_servers.id', ondelete='CASCADE'), nullable=False)
    created_by   = Column(UUID(as_uuid=True), ForeignKey('public.users.id'), nullable=False)
    title        = Column(String(100), nullable=False)
    description  = Column(Text, nullable=True)
    target_type  = Column(String(20), nullable=False)  # 'sessions' | 'volume_kg' | 'pr_count'
    target_value = Column(Integer, nullable=False)
    starts_at    = Column(DateTime(timezone=True), nullable=False)
    ends_at      = Column(DateTime(timezone=True), nullable=False)
    closed       = Column(Boolean, default=False)

class GymChallengeParticipant(Base):
    __tablename__ = 'gym_challenge_participants'
    id           = Column(Integer, primary_key=True, autoincrement=True)
    challenge_id = Column(Integer, ForeignKey('public.gym_challenges.id', ondelete='CASCADE'), nullable=False)
    user_id      = Column(UUID(as_uuid=True), ForeignKey('public.users.id', ondelete='CASCADE'), nullable=False)
    contribution = Column(Integer, nullable=False, default=0)  # unidades del target_type
    joined_at    = Column(DateTime(timezone=True), server_default=func.now())
```

### Gym verificado (ángulo comercial)

Un gimnasio real (negocio) puede **verificar** su gym server pagando una cuota mensual.
Beneficios del gym verificado:

| Feature | Sin verificar | Verificado |
|---------|---------------|------------|
| Miembros máximos | 50 | Ilimitado |
| Badge "Gym Oficial" | ❌ | ✅ |
| Analytics del gym (sesiones/semana, tier medio, retención) | ❌ | ✅ |
| Branding personalizado (logo, color) | ❌ | ✅ |
| Retos de gym | 1 activo | 5 activos |
| Aparece en directorio público de gyms | ❌ | ✅ |

```python
# Campo en GymServer:
is_verified  = Column(Boolean, default=False, nullable=False)
verified_at  = Column(DateTime(timezone=True), nullable=True)
max_members  = Column(Integer, default=50, nullable=False)   # 0 = ilimitado
```

El directorio público de gyms verificados actúa como canal de adquisición:
alguien que busca "CrossFit Madrid" en la app encuentra el gym, ve sus miembros
activos y su tier medio, y decide unirse.

### Endpoints sociales adicionales

```
GET  /api/gym-servers/{gym_id}/sparrings          Búsqueda de compañeros
POST /api/gym-servers/{gym_id}/connect/{user_id}  Solicitar conexión
GET  /api/gym-servers/directory?city=madrid       Directorio de gyms verificados
POST /api/gym-servers/{gym_id}/challenges         Crear reto (admin)
GET  /api/gym-servers/{gym_id}/challenges         Listar retos activos
POST /api/gym-servers/{gym_id}/challenges/{id}/join  Unirse a reto
```

---

## 12. Archivos adicionales (capa social)

| Archivo | Cambio |
|---------|--------|
| `backend/app/modules/gym_servers/models.py` | Añadir GymChallenge, GymChallengeParticipant; campo is_verified/max_members en GymServer |
| `backend/app/modules/gym_servers/router.py` | Endpoints sparrings, connect, directory, challenges |
| `frontend/js/ranked.js` | Sección "Buscar Sparring" + Retos de Gym |

---

## 13. Roadmap de implementación

**Fase A (este plan):**
- Tablas + API ranked (perfil, LP engine, leaderboard)
- Gym servers básico (crear, unirse, leaderboard interno, perfil público opt-in)
- Insignias de temporada
- Búsqueda de sparring dentro del gym
- Retos de gym (1 activo)
- UI dashboard: panel ranked + gym server + sparring

**Fase B (post-lanzamiento):**
- Ligas geográficas (ciudad → provincia → nacional → mundial)
- Job de cierre de temporada automatizado (APScheduler)
- Directorio de gyms verificados (modelo de negocio B2B)
- Notificaciones push al subir de tier, ganar insignia o recibir conexión
- Analytics dashboard para gyms verificados
- Perfil público con historial de temporadas y gym badges
