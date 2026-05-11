import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, TrendingDown, TrendingUp, Flame, Zap, Dumbbell, Brain,
  Loader2, Plus, Minus, Droplets, Footprints, RefreshCw, X,
  ChevronRight,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface GamificationState {
  xp_total: number
  level: number
  streak_days: number
  xp_to_next_level: number
  level_progress_pct: number
  weight_count: number
  routine_count: number
  badge_latest: string | null
}

interface HealthRecord {
  id: string
  recorded_date: string
  weight_kg: number | null
  sleep_hours: number | null
}

interface WeeklyGoals {
  motivational_message: string
  focus_area: string
  goals: string[]
}

interface AIRoutine {
  label: string
  days_per_week: number
  focus_area: string
  days: { exercises: unknown[] }[]
}

interface SavedRoutine {
  id: string
  label: string
  routine_json: string
}

/* ── localStorage helpers ───────────────────────────────────────────────────── */
function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

interface MealEntry { name: string; kcal: number; protein?: number }
interface DayPlan { breakfast: MealEntry[]; mid: MealEntry[]; lunch: MealEntry[]; snack: MealEntry[]; dinner: MealEntry[] }

function loadTodayMacros(): { kcal: number; protein: number } {
  try {
    const raw = localStorage.getItem(`hs_plan_${todayKey()}`)
    if (!raw) return { kcal: 0, protein: 0 }
    const plan: DayPlan = JSON.parse(raw)
    const all = (Object.values(plan) as MealEntry[][]).flat()
    return {
      kcal:    all.reduce((s, e) => s + e.kcal, 0),
      protein: all.reduce((s, e) => s + (e.protein ?? 0), 0),
    }
  } catch { return { kcal: 0, protein: 0 } }
}

function loadWater(): number {
  return parseFloat(localStorage.getItem(`hs_water_${todayKey()}`) ?? '0')
}

function saveWater(v: number) {
  localStorage.setItem(`hs_water_${todayKey()}`, String(Math.max(0, Math.round(v * 100) / 100)))
}

function loadSteps(): number {
  return parseInt(localStorage.getItem(`hs_steps_${todayKey()}`) ?? '0', 10)
}

function saveSteps(v: number) {
  localStorage.setItem(`hs_steps_${todayKey()}`, String(Math.max(0, v)))
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function CardLoader() {
  return (
    <div className="flex items-center justify-center py-5">
      <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
    </div>
  )
}

/* ── Weight log modal ───────────────────────────────────────────────────────── */
function WeightModal({ onSave, onClose }: { onSave: (kg: number) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    const kg = parseFloat(value)
    if (!kg || kg < 20 || kg > 400) { setErr('Introduce un peso válido (20–400 kg)'); return }
    setSaving(true)
    try { await onSave(kg) } catch (e) { setErr(e instanceof Error ? e.message : 'Error al guardar') } finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-white">Registrar peso</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1.5 block">Peso (kg)</label>
          <input
            autoFocus
            type="number"
            value={value}
            onChange={e => { setValue(e.target.value); setErr(null) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="75.5"
            step="0.1"
            min="20"
            max="400"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg font-bold placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 min-h-[52px]"
          />
          {err && <p className="text-xs text-red-400 mt-1.5">{err}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-300 hover:bg-zinc-700">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Steps modal ─────────────────────────────────────────────────────────────── */
function StepsModal({ current, onSave, onClose }: { current: number; onSave: (n: number) => void; onClose: () => void }) {
  const [value, setValue] = useState(String(current || ''))
  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-white">Registrar pasos</p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <input
          autoFocus type="number" value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSave(parseInt(value, 10))}
          placeholder="6500" min="0"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-lg font-bold placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 min-h-[52px]"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-300">Cancelar</button>
          <button onClick={() => onSave(parseInt(value, 10) || 0)} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold">
            Guardar
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Main screen ─────────────────────────────────────────────────────────────── */
export function TodayScreen() {
  const user        = useAuthStore(s => s.user)
  const navigate    = useNavigate()
  const displayName = user?.display_name ?? user?.email?.split('@')[0] ?? 'atleta'

  const hour     = new Date().getHours()
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const today    = todayKey()

  /* ── Gamification ── */
  const [gami, setGami]         = useState<GamificationState | null>(null)
  const [gamiLoading, setGamiLoading] = useState(true)

  /* ── Health records (weight) ── */
  const [records, setRecords]   = useState<HealthRecord[]>([])
  const [recLoading, setRecLoading] = useState(true)
  const [showWeightModal, setShowWeightModal] = useState(false)

  /* ── AI Insight ── */
  const [insight, setInsight]   = useState<WeeklyGoals | null>(null)
  const [insightLoading, setInsightLoading] = useState(true)

  /* ── Active routine ── */
  const [activeRoutine, setActiveRoutine] = useState<{ label: string; totalExercises: number; daysPerWeek: number } | null>(null)
  const [routineLoading, setRoutineLoading] = useState(true)

  /* ── Macros (localStorage) ── */
  const [macros, setMacros]     = useState(loadTodayMacros)

  /* ── Water / Steps (localStorage) ── */
  const [water, setWaterState]  = useState(loadWater)
  const [steps, setStepsState]  = useState(loadSteps)
  const [showStepsModal, setShowStepsModal] = useState(false)

  const KCAL_TARGET    = 2100
  const PROTEIN_TARGET = 160
  const WATER_TARGET   = 2.5
  const STEPS_TARGET   = 10000

  /* ── Fetch all API data in parallel ── */
  const fetchAll = useCallback(async () => {
    setGamiLoading(true)
    setRecLoading(true)
    setInsightLoading(true)
    setRoutineLoading(true)

    await Promise.allSettled([
      // Gamification
      api.get<GamificationState>('/api/v1/gamification/state')
        .then(d => setGami(d))
        .finally(() => setGamiLoading(false)),

      // Latest 2 health records
      api.get<{ records: HealthRecord[] }>('/api/v1/health/records?limit=2')
        .then(d => setRecords(d.records))
        .finally(() => setRecLoading(false)),

      // Weekly goals / insight
      api.get<WeeklyGoals>('/api/v1/ai_insights/weekly-goals')
        .then(d => setInsight(d))
        .finally(() => setInsightLoading(false)),

      // Active routine
      (async () => {
        const activeId = localStorage.getItem('hs_active_routine_id')
        if (!activeId) { setRoutineLoading(false); return }
        try {
          const data = await api.get<{ routines: SavedRoutine[] }>('/api/v1/routines/')
          const found = data.routines.find(r => r.id === activeId)
          if (found) {
            const parsed: AIRoutine = JSON.parse(found.routine_json)
            const totalExercises = parsed.days.reduce((s, d) => s + d.exercises.length, 0)
            setActiveRoutine({ label: parsed.label, totalExercises, daysPerWeek: parsed.days_per_week })
          }
        } catch { /* ignore */ } finally { setRoutineLoading(false) }
      })(),
    ])
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ── Refresh macros when screen comes into focus (user may have added meals) ── */
  useEffect(() => {
    const refresh = () => setMacros(loadTodayMacros())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  /* ── Weight save ── */
  async function handleSaveWeight(kg: number) {
    await api.post('/api/v1/health/records', { recorded_date: today, weight_kg: kg })
    await api.post('/api/v1/gamification/action', { action: 'weight' })
    setShowWeightModal(false)
    setRecLoading(true)
    const data = await api.get<{ records: HealthRecord[] }>('/api/v1/health/records?limit=2')
    setRecords(data.records)
    setRecLoading(false)
    const g = await api.get<GamificationState>('/api/v1/gamification/state')
    setGami(g)
  }

  /* ── Water controls ── */
  function addWater(delta: number) {
    const next = Math.max(0, Math.round((water + delta) * 100) / 100)
    saveWater(next)
    setWaterState(next)
  }

  /* ── Steps ── */
  function handleSaveSteps(n: number) {
    saveSteps(n)
    setStepsState(n)
    setShowStepsModal(false)
  }

  /* ── Derived weight data ── */
  const latestWeight = records.find(r => r.weight_kg != null)?.weight_kg ?? null
  const prevWeight   = records.filter(r => r.weight_kg != null)[1]?.weight_kg ?? null
  const weightDelta  = latestWeight != null && prevWeight != null ? latestWeight - prevWeight : null

  return (
    <PageContainer>
      <TopBar
        title={`${greeting}, ${displayName} 👋`}
        right={
          <button aria-label="Notificaciones" className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </button>
        }
      />

      <ScrollArea>
        {/* ── Hero: Racha + XP ── */}
        <div className="bg-gradient-to-r from-cyan-500/15 to-teal-500/10 border border-cyan-500/25 rounded-2xl p-4 card-glow-cyan">
          {gamiLoading ? (
            <CardLoader />
          ) : gami ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-bold text-white">
                    {gami.streak_days} {gami.streak_days === 1 ? 'día' : 'días'} de racha
                  </span>
                </div>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-full font-semibold">
                  Nivel {gami.level}
                </span>
              </div>
              <ProgressBar value={gami.level_progress_pct} max={100} colorClass="bg-gradient-to-r from-teal-500 to-cyan-400" />
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-zinc-500">{gami.xp_total} XP</span>
                <span className="text-[10px] text-zinc-500">+{gami.xp_to_next_level} para nivel {gami.level + 1}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-bold text-white">Empieza tu racha hoy</span>
              </div>
              <button onClick={fetchAll} className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Peso hoy ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Peso hoy</p>
          {recLoading ? (
            <CardLoader />
          ) : (
            <div className="flex items-end justify-between">
              <div>
                {latestWeight != null ? (
                  <>
                    <p className="text-3xl font-bold text-white tracking-tight">
                      {latestWeight.toFixed(1)} <span className="text-base text-zinc-500 font-normal">kg</span>
                    </p>
                    {weightDelta != null && (
                      <p className={`text-xs mt-1 flex items-center gap-1 ${weightDelta < 0 ? 'text-green-400' : weightDelta > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {weightDelta < 0 ? <TrendingDown className="w-3 h-3" /> : weightDelta > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                        {weightDelta === 0 ? 'Sin cambio' : `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg respecto al registro anterior`}
                      </p>
                    )}
                    {weightDelta === null && <p className="text-xs text-zinc-600 mt-1">Solo un registro disponible</p>}
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">Sin registros aún</p>
                )}
              </div>
              <button
                onClick={() => setShowWeightModal(true)}
                className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[44px] shadow-[0_2px_10px_rgba(8,145,178,0.3)]"
              >
                Registrar
              </button>
            </div>
          )}
        </div>

        {/* ── Macros del día ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Macros de hoy</p>
            <button onClick={() => navigate('/app/nutrition')} className="text-xs text-cyan-400 hover:underline flex items-center gap-1">
              Añadir <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {macros.kcal === 0 && macros.protein === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-2">
              Sin comidas registradas hoy.{' '}
              <button onClick={() => navigate('/app/nutrition')} className="text-cyan-400 hover:underline">Registrar ahora</button>
            </p>
          ) : (
            <>
              {[
                { label: 'Calorías', value: macros.kcal,    max: KCAL_TARGET,    colorClass: 'bg-orange-400', display: `${macros.kcal} / ${KCAL_TARGET} kcal` },
                { label: 'Proteína', value: macros.protein, max: PROTEIN_TARGET, colorClass: 'bg-sky-400',    display: `${macros.protein} / ${PROTEIN_TARGET} g` },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-zinc-400 font-medium">{m.label}</span>
                    <span className="text-zinc-400">{m.display}</span>
                  </div>
                  <ProgressBar value={m.value} max={m.max} colorClass={m.colorClass} />
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Entrenamiento hoy ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Dumbbell className="w-4 h-4 text-cyan-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entrenamiento hoy</p>
          </div>
          {routineLoading ? (
            <CardLoader />
          ) : activeRoutine ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {activeRoutine.label}
                </span>
                <span className="text-xs text-zinc-500">{activeRoutine.daysPerWeek} días/sem</span>
              </div>
              <p className="text-sm text-zinc-300 mb-3">{activeRoutine.totalExercises} ejercicios en total</p>
              <button
                onClick={() => navigate('/app/train')}
                className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[48px] shadow-[0_2px_12px_rgba(8,145,178,0.3)]"
              >
                Ir a la rutina →
              </button>
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-zinc-500 mb-3">No tienes una rutina activa</p>
              <button
                onClick={() => navigate('/app/train')}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[44px]"
              >
                Crear rutina con IA
              </button>
            </div>
          )}
        </div>

        {/* ── AI Insight ── */}
        <div className="bg-zinc-900 border border-violet-500/20 rounded-2xl p-4 card-glow-violet">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">IA Insight del día</p>
            </div>
            {!insightLoading && (
              <button onClick={() => navigate('/app/insights')} className="text-xs text-violet-400 hover:underline flex items-center gap-1">
                Ver más <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          {insightLoading ? (
            <CardLoader />
          ) : insight ? (
            <>
              <p className="text-sm text-zinc-300 leading-relaxed italic">"{insight.motivational_message}"</p>
              {insight.focus_area && (
                <p className="text-[11px] text-violet-400/70 mt-2 font-semibold">Área: {insight.focus_area}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">Sin insights disponibles</p>
          )}
        </div>

        {/* ── Pasos / Agua ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Pasos */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Pasos</p>
              <button
                onClick={() => setShowStepsModal(true)}
                className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700"
                aria-label="Registrar pasos"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Footprints className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-xl font-bold text-white">{steps.toLocaleString('es-ES')}</p>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">/ {STEPS_TARGET.toLocaleString('es-ES')} obj.</p>
            <ProgressBar value={steps} max={STEPS_TARGET} colorClass="bg-green-400" />
          </div>

          {/* Agua */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Agua</p>
              <div className="flex gap-1">
                <button
                  onClick={() => addWater(-0.25)}
                  className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700"
                  aria-label="Quitar 250ml"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => addWater(0.25)}
                  className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700"
                  aria-label="Añadir 250ml"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Droplets className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-xl font-bold text-white">{water.toFixed(2)} <span className="text-sm font-normal text-zinc-500">L</span></p>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">/ {WATER_TARGET} L obj.</p>
            <ProgressBar value={water} max={WATER_TARGET} colorClass="bg-blue-400" />
          </div>
        </div>

        {/* ── XP earned today ── */}
        {gami && (gami.weight_count > 0 || gami.routine_count > 0) && (
          <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {gami.badge_latest ? `${gami.badge_latest} desbloqueado` : `Nivel ${gami.level} · ${gami.xp_total} XP totales`}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {gami.weight_count} peso{gami.weight_count !== 1 ? 's' : ''} registrado{gami.weight_count !== 1 ? 's' : ''} · {gami.routine_count} rutina{gami.routine_count !== 1 ? 's' : ''} guardada{gami.routine_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* ── Modals ── */}
      {showWeightModal && (
        <WeightModal onSave={handleSaveWeight} onClose={() => setShowWeightModal(false)} />
      )}
      {showStepsModal && (
        <StepsModal current={steps} onSave={handleSaveSteps} onClose={() => setShowStepsModal(false)} />
      )}
    </PageContainer>
  )
}
