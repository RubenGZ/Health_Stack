/**
 * e2e/mock-api/server.js
 * ─────────────────────
 * Full mock API server for running Playwright E2E tests without a real
 * FastAPI/PostgreSQL backend.
 *
 * Covers all endpoints used by tests:
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/register
 *   GET  /api/v1/auth/me
 *   POST /api/v1/auth/refresh
 *   DELETE /api/v1/auth/account
 *   GET  /api/v1/gamification/state
 *   POST /api/v1/gamification/action
 *   GET  /api/v1/health/records
 *   POST /api/v1/health/records
 *   PATCH /api/v1/health/records/:id
 *   GET  /api/v1/routines/
 *   POST /api/v1/routines/
 *   GET  /api/v1/community/posts
 *   POST /api/v1/community/posts
 *   POST /api/v1/community/posts/:id/like
 *   GET  /api/v1/nutrition/supplements
 *   GET  /api/v1/nutrition/ingredients
 *   GET  /api/v1/nutrition/recipes
 *   POST /api/v1/nutrition/recipes
 *   GET  /api/v1/ai_insights/weekly-goals
 *   GET  /health      (healthcheck)
 *
 * Usage: node e2e/mock-api/server.js
 * Port:  8000 (override with PORT env var)
 */

'use strict'

const http = require('http')
const PORT = process.env.PORT || 8000

// ── Fake data store ──────────────────────────────────────────────────────────

const users = new Map([
  ['e2e_user@healthstack.test',  { id: 'user-e2e-001', email: 'e2e_user@healthstack.test',  display_name: 'E2E Atleta', role: 'user',  password: 'E2eTest!2026' }],
  ['e2e_admin@healthstack.test', { id: 'user-e2e-002', email: 'e2e_admin@healthstack.test', display_name: 'E2E Admin',  role: 'admin', password: 'E2eAdmin!2026' }],
  // QA fallback for any valid-looking token
  ['qa@healthstack.test', { id: 'qa-001', email: 'qa@healthstack.test', display_name: 'QA Tester', role: 'user', password: 'qa' }],
])

// simple token → user mapping (in-memory)
const tokens = new Map()

const today = new Date().toISOString().slice(0, 10)

const healthRecords = [
  { id: 'rec-001', recorded_date: today,                                   weight_kg: 84.2, sleep_hours: null },
  { id: 'rec-002', recorded_date: addDays(today, -1),  weight_kg: 84.5, sleep_hours: 7.5  },
  { id: 'rec-003', recorded_date: addDays(today, -2),  weight_kg: 84.8, sleep_hours: 8.0  },
  { id: 'rec-004', recorded_date: addDays(today, -4),  weight_kg: 85.0, sleep_hours: 6.5  },
  { id: 'rec-005', recorded_date: addDays(today, -7),  weight_kg: 85.3, sleep_hours: 7.0  },
  { id: 'rec-006', recorded_date: addDays(today, -10), weight_kg: 85.5, sleep_hours: null },
  { id: 'rec-007', recorded_date: addDays(today, -14), weight_kg: 85.8, sleep_hours: 7.5  },
  { id: 'rec-008', recorded_date: addDays(today, -21), weight_kg: 86.1, sleep_hours: 8.0  },
  { id: 'rec-009', recorded_date: addDays(today, -28), weight_kg: 86.5, sleep_hours: 7.0  },
  { id: 'rec-010', recorded_date: addDays(today, -35), weight_kg: 87.0, sleep_hours: 6.0  },
]

const savedRoutines = [
  {
    id: 'routine-e2e-001',
    label: 'E2E Fuerza Total',
    routine_json: JSON.stringify({
      label: 'E2E Fuerza Total',
      description: 'Rutina de prueba para E2E — 3 días a la semana, full body.',
      days_per_week: 3,
      focus_area: 'Fuerza',
      days: [
        { day_label: 'Día 1 — Empuje', focus: 'Pecho, Hombros, Tríceps',
          exercises: [
            { name: 'Press banca', sets: 4, reps: '6-8', rest: '90s', notes: '' },
            { name: 'Press militar', sets: 3, reps: '8-10', rest: '60s', notes: '' },
            { name: 'Extensión tríceps', sets: 3, reps: '12', rest: '45s', notes: '' },
          ]},
        { day_label: 'Día 2 — Tirón', focus: 'Espalda, Bíceps',
          exercises: [
            { name: 'Dominadas', sets: 4, reps: '6-8', rest: '90s', notes: '' },
            { name: 'Remo barra', sets: 3, reps: '8', rest: '75s', notes: '' },
            { name: 'Curl bíceps', sets: 3, reps: '12', rest: '45s', notes: '' },
          ]},
        { day_label: 'Día 3 — Pierna', focus: 'Cuádriceps, Glúteo, Femoral',
          exercises: [
            { name: 'Sentadilla', sets: 4, reps: '6-8', rest: '120s', notes: '' },
            { name: 'Peso muerto', sets: 3, reps: '5', rest: '120s', notes: '' },
            { name: 'Prensa pierna', sets: 3, reps: '12', rest: '60s', notes: '' },
          ]},
      ],
    }),
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
]

const communityPosts = [
  { id: 'p-001', user_id: 'user-e2e-001', display_name: 'E2E Atleta', content: '¡Primer PR en sentadilla! 100 kg. 🎉', likes_count: 5,  created_at: new Date(Date.now() - 3600000).toISOString(),  liked_by_me: false },
  { id: 'p-002', user_id: 'user-e2e-001', display_name: 'E2E Atleta', content: 'Semana 2 completada — 4 sesiones consecutivas.', likes_count: 3, created_at: new Date(Date.now() - 86400000).toISOString(), liked_by_me: false },
  { id: 'p-003', user_id: 'user-e2e-002', display_name: 'E2E Admin',  content: '¿Alguien usa el planner de nutrición?', likes_count: 8, created_at: new Date(Date.now() - 172800000).toISOString(), liked_by_me: true },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function makeToken(userId) {
  const tok = `mock_tok_${userId}_${Date.now()}`
  tokens.set(tok, userId)
  return tok
}

function userForToken(req) {
  const auth = req.headers['authorization'] || ''
  const tok  = auth.replace(/^Bearer\s+/i, '')
  const uid  = tokens.get(tok)
  if (uid) return [...users.values()].find(u => u.id === uid) ?? null
  // Fall back: any non-empty token → return e2e user (for tests that inject localStorage)
  if (tok) {
    return users.get('e2e_user@healthstack.test') ?? null
  }
  return null
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = ''
    req.on('data', d => buf += d)
    req.on('end', () => {
      try { resolve(JSON.parse(buf)) } catch { resolve({}) }
    })
  })
}

// ── Route table ───────────────────────────────────────────────────────────────

async function route(req, res) {
  const url    = new URL(req.url, `http://localhost:${PORT}`)
  const path   = url.pathname
  const method = req.method.toUpperCase()

  // CORS preflight
  if (method === 'OPTIONS') { json(res, 204, {}); return }

  // Health check
  if (path === '/health' && method === 'GET') {
    json(res, 200, { status: 'ok' }); return
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  if (path === '/api/v1/auth/login' && method === 'POST') {
    const body = await readBody(req)
    const user = users.get(body.email ?? '')
    if (!user || user.password !== body.password) {
      json(res, 401, { detail: 'Credenciales incorrectas' }); return
    }
    const access_token  = makeToken(user.id)
    const refresh_token = makeToken(user.id + '_ref')
    json(res, 200, { access_token, refresh_token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } })
    return
  }

  if (path === '/api/v1/auth/register' && method === 'POST') {
    const body = await readBody(req)
    const email = body.email ?? ''
    if (users.has(email)) { json(res, 409, { detail: 'Email ya registrado' }); return }
    const newUser = { id: `user-${Date.now()}`, email, display_name: body.display_name ?? email.split('@')[0], role: 'user', password: body.password ?? '' }
    users.set(email, newUser)
    const access_token  = makeToken(newUser.id)
    const refresh_token = makeToken(newUser.id + '_ref')
    json(res, 201, { access_token, refresh_token, user: newUser })
    return
  }

  if (path === '/api/v1/auth/me' && method === 'GET') {
    const user = userForToken(req)
    if (!user) { json(res, 401, { detail: 'No autenticado' }); return }
    json(res, 200, { id: user.id, email: user.email, display_name: user.display_name, role: user.role })
    return
  }

  if (path === '/api/v1/auth/refresh' && method === 'POST') {
    json(res, 200, { access_token: 'mock_refreshed_' + Date.now(), refresh_token: 'mock_ref_' + Date.now() })
    return
  }

  if (path === '/api/v1/auth/account' && method === 'DELETE') {
    const user = userForToken(req)
    if (user) users.delete(user.email)
    json(res, 200, { detail: 'Account deleted' }); return
  }

  // ── Gamification ──────────────────────────────────────────────────────────────

  if (path === '/api/v1/gamification/state' && method === 'GET') {
    json(res, 200, {
      xp_total: 480,
      level: 1,
      streak_days: 5,
      xp_to_next_level: 20,
      level_progress_pct: 96,
      weight_count: 10,
      routine_count: 1,
      badge_latest: '⚖️',
    }); return
  }

  if (path === '/api/v1/gamification/action' && method === 'POST') {
    json(res, 200, { xp_earned: 50, new_total: 530, level: 2, leveled_up: true }); return
  }

  // ── Health records ────────────────────────────────────────────────────────────

  if (path === '/api/v1/health/records' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10)
    json(res, 200, { records: healthRecords.slice(0, limit) }); return
  }

  if (path === '/api/v1/health/records' && method === 'POST') {
    const body = await readBody(req)
    // Check if record for this date already exists
    const existing = healthRecords.find(r => r.recorded_date === body.recorded_date)
    if (existing) { json(res, 409, { detail: 'Ya existe un registro para la fecha ' + body.recorded_date }); return }
    const rec = { id: `rec-${Date.now()}`, recorded_date: body.recorded_date, weight_kg: body.weight_kg ?? null, sleep_hours: body.sleep_hours ?? null }
    healthRecords.unshift(rec)
    json(res, 201, rec); return
  }

  const patchMatch = path.match(/^\/api\/v1\/health\/records\/([^/]+)$/)
  if (patchMatch && method === 'PATCH') {
    const body = await readBody(req)
    const rec = healthRecords.find(r => r.id === patchMatch[1])
    if (!rec) { json(res, 404, { detail: 'Record not found' }); return }
    if (body.weight_kg   !== undefined) rec.weight_kg   = body.weight_kg
    if (body.sleep_hours !== undefined) rec.sleep_hours = body.sleep_hours
    json(res, 200, rec); return
  }

  // ── Routines ──────────────────────────────────────────────────────────────────

  if (path === '/api/v1/routines/' && method === 'GET') {
    json(res, 200, { routines: savedRoutines }); return
  }

  if (path === '/api/v1/routines/' && method === 'POST') {
    const body = await readBody(req)
    const r = { id: `routine-${Date.now()}`, label: body.label ?? 'Rutina', routine_json: body.routine_json ?? '{}', created_at: new Date().toISOString() }
    savedRoutines.unshift(r)
    json(res, 201, r); return
  }

  // ── Community ─────────────────────────────────────────────────────────────────

  if (path === '/api/v1/community/posts' && method === 'GET') {
    json(res, 200, { posts: communityPosts, total: communityPosts.length }); return
  }

  if (path === '/api/v1/community/posts' && method === 'POST') {
    const body = await readBody(req)
    const user = userForToken(req)
    const post = { id: `p-${Date.now()}`, user_id: user?.id ?? 'anon', display_name: user?.display_name ?? 'Anon', content: body.content ?? '', likes_count: 0, created_at: new Date().toISOString(), liked_by_me: false }
    communityPosts.unshift(post)
    json(res, 201, post); return
  }

  const likeMatch = path.match(/^\/api\/v1\/community\/posts\/([^/]+)\/like$/)
  if (likeMatch && method === 'POST') {
    const post = communityPosts.find(p => p.id === likeMatch[1])
    if (post) { post.likes_count++; post.liked_by_me = true }
    json(res, 200, post ?? {}); return
  }

  // ── Nutrition ─────────────────────────────────────────────────────────────────

  if (path === '/api/v1/nutrition/supplements' && method === 'GET') {
    json(res, 200, [
      { id: 1, name: 'Creatina Monohidrato', dose: '5 g/día', timing: 'Post-entreno', description: 'Aumenta la fuerza y la masa muscular en ejercicios de alta intensidad.', icon_emoji: '💪', evidence_level: 'A' },
      { id: 2, name: 'Proteína Whey', dose: '25 g', timing: 'Post-entreno', description: 'Estimula la síntesis proteica y la recuperación muscular.', icon_emoji: '🥛', evidence_level: 'A' },
      { id: 3, name: 'Vitamina D3', dose: '2 000 UI', timing: 'Con comida grasa', description: 'Salud ósea, sistema inmune y función muscular.', icon_emoji: '☀️', evidence_level: 'B' },
    ]); return
  }

  if (path === '/api/v1/nutrition/ingredients' && method === 'GET') {
    json(res, 200, [
      { id: 1, name: 'Pechuga de pollo', category: 'Proteína', protein: 31, carbs: 0, fat: 3.6, calories: 165 },
      { id: 2, name: 'Arroz blanco', category: 'Carbohidratos', protein: 2.7, carbs: 28, fat: 0.3, calories: 130 },
      { id: 3, name: 'Huevo entero', category: 'Proteína', protein: 13, carbs: 1.1, fat: 11, calories: 155 },
    ]); return
  }

  if (path.startsWith('/api/v1/nutrition/recipes') && method === 'GET') {
    json(res, 200, []); return
  }

  if (path.startsWith('/api/v1/nutrition/recipes') && method === 'POST') {
    const body = await readBody(req)
    json(res, 201, { id: Date.now(), ...body, total_calories: 300, total_protein: 30, total_carbs: 20, total_fat: 10, created_at: new Date().toISOString() })
    return
  }

  // ── AI Insights ───────────────────────────────────────────────────────────────

  if (path.startsWith('/api/v1/ai_insights/weekly') && method === 'GET') {
    json(res, 200, {
      motivational_message: '¡7 días consecutivos activo! Sigue así.',
      focus_area: 'Fuerza',
      goals: ['4 sesiones de fuerza', '10 000 pasos diarios', 'Proteína 150 g/día'],
    }); return
  }

  if (path.startsWith('/api/v1/ai_insights/biomarker') && method === 'GET') {
    json(res, 200, { narrative: 'Tendencia positiva en los últimos 30 días. Sin anomalías.' }); return
  }

  if (path.startsWith('/api/v1/ai_insights/injury') && method === 'GET') {
    json(res, 200, { risk_level: 'low', summary: 'Perfil bajo. Sin sobreentrenamiento detectado.', recommendations: ['1-2 días descanso activo/semana', 'Duerme 7h+'] }); return
  }

  if (path.startsWith('/api/v1/ai_coach') || path.startsWith('/api/v1/chat')) {
    json(res, 200, { reply: 'Respuesta del coach IA: ¡Sigue entrenando duro!' }); return
  }

  // ── 404 fallthrough ───────────────────────────────────────────────────────────
  json(res, 404, { detail: `Not found: ${method} ${path}` })
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (err) {
    console.error('[mock-api] Error:', err)
    json(res, 500, { detail: 'Internal mock server error' })
  }
})

server.listen(PORT, () => {
  console.log(`[mock-api] HealthStack mock API running on http://localhost:${PORT}`)
  console.log('[mock-api] Test users:')
  console.log('  e2e_user@healthstack.test  / E2eTest!2026')
  console.log('  e2e_admin@healthstack.test / E2eAdmin!2026')
})
