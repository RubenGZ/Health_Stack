import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Zap, ChevronDown, ChevronUp,
  Loader2, Search, Sparkles, Dumbbell, CheckCircle2,
  RefreshCw, Flame,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface SavedRoutine {
  id: string
  label: string
  routine_json: string
  created_at: string
}

interface AIExercise {
  name: string
  muscle_group: string
  sets: number
  reps: string
  rest_sec: number
  notes: string
}

interface AIDay {
  day_label: string
  focus: string
  exercises: AIExercise[]
}

interface AIRoutine {
  label: string
  description: string
  days_per_week: number
  focus_area: string
  days: AIDay[]
}

/* ── Static exercise catalog ─────────────────────────────────────────────── */
const CATALOG: { name: string; group: string; sets: string; equipment: string }[] = [
  { name: 'Press de banca', group: 'Pecho', sets: '4×8-10', equipment: 'Barra' },
  { name: 'Press inclinado mancuernas', group: 'Pecho', sets: '3×10-12', equipment: 'Mancuernas' },
  { name: 'Fondos en paralelas', group: 'Pecho/Tríceps', sets: '3×10-12', equipment: 'Paralelas' },
  { name: 'Aperturas con mancuernas', group: 'Pecho', sets: '3×12-15', equipment: 'Mancuernas' },
  { name: 'Sentadilla', group: 'Pierna', sets: '4×6-8', equipment: 'Barra' },
  { name: 'Prensa de pierna', group: 'Pierna', sets: '4×10-12', equipment: 'Máquina' },
  { name: 'Sentadilla búlgara', group: 'Pierna', sets: '3×10', equipment: 'Mancuernas' },
  { name: 'Extensión cuádriceps', group: 'Pierna', sets: '3×12-15', equipment: 'Máquina' },
  { name: 'Curl femoral', group: 'Pierna', sets: '3×12-15', equipment: 'Máquina' },
  { name: 'Hip thrust', group: 'Glúteo', sets: '4×10-12', equipment: 'Barra' },
  { name: 'Peso muerto', group: 'Espalda', sets: '3×5', equipment: 'Barra' },
  { name: 'Dominadas', group: 'Espalda', sets: '3×máx', equipment: 'Barra fija' },
  { name: 'Remo con barra', group: 'Espalda', sets: '4×8-10', equipment: 'Barra' },
  { name: 'Remo mancuerna', group: 'Espalda', sets: '3×10-12', equipment: 'Mancuernas' },
  { name: 'Jalón al pecho', group: 'Espalda', sets: '4×10-12', equipment: 'Polea' },
  { name: 'Press militar', group: 'Hombros', sets: '4×8-12', equipment: 'Barra' },
  { name: 'Elevaciones laterales', group: 'Hombros', sets: '4×12-15', equipment: 'Mancuernas' },
  { name: 'Face pull', group: 'Hombros', sets: '3×15', equipment: 'Polea' },
  { name: 'Curl bíceps barra', group: 'Bíceps', sets: '3×10-12', equipment: 'Barra' },
  { name: 'Curl martillo', group: 'Bíceps', sets: '3×12', equipment: 'Mancuernas' },
  { name: 'Extensión tríceps polea', group: 'Tríceps', sets: '3×12-15', equipment: 'Polea' },
  { name: 'Press francés', group: 'Tríceps', sets: '3×10-12', equipment: 'Barra' },
  { name: 'Plancha abdominal', group: 'Core', sets: '3×40s', equipment: 'Sin equipo' },
  { name: 'Crunch abdominal', group: 'Core', sets: '3×15-20', equipment: 'Sin equipo' },
  { name: 'Elevación de piernas', group: 'Core', sets: '3×15', equipment: 'Sin equipo' },
  { name: 'Gemelos de pie', group: 'Pierna', sets: '4×15-20', equipment: 'Máquina' },
  { name: 'Burpees', group: 'Full body', sets: '3×10', equipment: 'Sin equipo' },
  { name: 'Pull-up lastrado', group: 'Espalda', sets: '4×5-6', equipment: 'Cinturón' },
]

const GROUPS = ['Todos', 'Pecho', 'Pierna', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Core', 'Glúteo', 'Full body']

/* ── Chip selector ───────────────────────────────────────────────────────── */
const CHIPS = ['Rutinas', 'Ejercicios', 'Rutinas IA']

/* ── RoutineCard ─────────────────────────────────────────────────────────── */
function RoutineCard({
  routine,
  isActive,
  onActivate,
  onDelete,
}: {
  routine: SavedRoutine
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  let parsed: AIRoutine | null = null
  try { parsed = JSON.parse(routine.routine_json) } catch { /* ignore */ }

  return (
    <div className={cn(
      'bg-zinc-900 border rounded-2xl overflow-hidden transition-all',
      isActive ? 'border-cyan-500/40' : 'border-zinc-800',
    )}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">
                <Flame className="w-3 h-3" /> Activa
              </span>
            )}
            <p className="font-bold text-white truncate">{routine.label}</p>
            {parsed && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {parsed.days_per_week} días/sem · {parsed.focus_area}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onActivate}
              className={cn(
                'text-xs font-bold px-3 py-2 rounded-xl min-h-[40px] border transition-all',
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-cyan-500/30 hover:text-cyan-400',
              )}
            >
              {isActive ? 'Activa' : 'Activar'}
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Eliminar rutina"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {parsed && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-3 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Ocultar días' : `Ver ${parsed.days.length} días`}
          </button>
        )}
      </div>

      {expanded && parsed && (
        <div className="border-t border-zinc-800 px-4 pb-4 flex flex-col gap-3 mt-1 pt-3">
          {parsed.days.map((day, di) => (
            <div key={di} className="bg-zinc-800/50 rounded-xl p-3">
              <p className="text-xs font-bold text-cyan-400 mb-2">{day.day_label} — {day.focus}</p>
              <div className="flex flex-col gap-1.5">
                {day.exercises.map((ex, ei) => (
                  <div key={ei} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{ex.name}</span>
                    <span className="text-zinc-500 font-mono">{ex.sets}×{ex.reps}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Rutinas IA wizard ───────────────────────────────────────────────────── */
const WIZARD_STEPS = [
  {
    key: 'goal',
    question: '¿Cuál es tu objetivo?',
    options: [
      { value: 'strength',    label: 'Fuerza', emoji: '🏋️' },
      { value: 'hypertrophy', label: 'Hipertrofia', emoji: '💪' },
      { value: 'fat_loss',    label: 'Pérdida de grasa', emoji: '🔥' },
      { value: 'endurance',   label: 'Resistencia', emoji: '🏃' },
    ],
  },
  {
    key: 'level',
    question: '¿Cuál es tu nivel?',
    options: [
      { value: 'beginner',     label: 'Principiante', emoji: '🌱' },
      { value: 'intermediate', label: 'Intermedio',   emoji: '⚡' },
      { value: 'advanced',     label: 'Avanzado',     emoji: '🚀' },
    ],
  },
  {
    key: 'days_per_week',
    question: '¿Cuántos días entrenas por semana?',
    options: [
      { value: '3', label: '3 días', emoji: '📅' },
      { value: '4', label: '4 días', emoji: '📅' },
      { value: '5', label: '5 días', emoji: '📅' },
      { value: '6', label: '6 días', emoji: '📅' },
    ],
  },
  {
    key: 'equipment',
    question: '¿Qué equipamiento tienes?',
    options: [
      { value: 'full_gym',     label: 'Gimnasio completo', emoji: '🏪' },
      { value: 'home_weights', label: 'Casa con pesas',    emoji: '🏠' },
      { value: 'bodyweight',   label: 'Solo cuerpo',       emoji: '🤸' },
    ],
  },
]

/* ── Main screen ─────────────────────────────────────────────────────────── */
export function TrainScreen() {
  const [chip, setChip] = useState('Rutinas')

  /* ── Tab 1: Rutinas ── */
  const [routines, setRoutines]       = useState<SavedRoutine[]>([])
  const [routinesLoading, setRoutinesLoading] = useState(true)
  const [routinesError,   setRoutinesError]   = useState<string | null>(null)
  const [activeId, setActiveId]       = useState<string | null>(
    () => localStorage.getItem('hs_active_routine_id'),
  )

  const fetchRoutines = useCallback(async () => {
    setRoutinesLoading(true)
    setRoutinesError(null)
    try {
      const data = await api.get<{ routines: SavedRoutine[]; total: number }>('/api/v1/routines/')
      setRoutines(data.routines)
    } catch (e) {
      setRoutinesError(e instanceof Error ? e.message : 'Error al cargar rutinas')
    } finally {
      setRoutinesLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoutines() }, [fetchRoutines])

  function handleActivate(id: string) {
    setActiveId(id)
    localStorage.setItem('hs_active_routine_id', id)
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/routines/${id}`)
      setRoutines(prev => prev.filter(r => r.id !== id))
      if (activeId === id) {
        setActiveId(null)
        localStorage.removeItem('hs_active_routine_id')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  /* ── Tab 2: Ejercicios ── */
  const [search,    setSearch]    = useState('')
  const [groupFilt, setGroupFilt] = useState('Todos')

  const filtered = CATALOG.filter(ex => {
    const matchGroup = groupFilt === 'Todos' || ex.group === groupFilt
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    return matchGroup && matchSearch
  })

  /* ── Tab 3: Rutinas IA ── */
  const [wizardStep,    setWizardStep]    = useState(0)
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, string>>({})
  const [aiLoading,     setAiLoading]     = useState(false)
  const [aiResult,      setAiResult]      = useState<AIRoutine | null>(null)
  const [aiError,       setAiError]       = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [savedOk,       setSavedOk]       = useState(false)

  function handleWizardPick(key: string, value: string) {
    const next = { ...wizardAnswers, [key]: value }
    setWizardAnswers(next)
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep(s => s + 1)
    } else {
      generateRoutine(next)
    }
  }

  async function generateRoutine(answers: Record<string, string>) {
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    setSavedOk(false)
    try {
      const result = await api.post<AIRoutine>('/api/v1/routines/ai-generate', {
        goal:         answers.goal,
        level:        answers.level,
        days_per_week: parseInt(answers.days_per_week, 10),
        equipment:    answers.equipment,
      })
      setAiResult(result)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Error al generar rutina')
    } finally {
      setAiLoading(false)
    }
  }

  async function saveAiRoutine() {
    if (!aiResult) return
    setSaving(true)
    try {
      await api.post('/api/v1/routines/', {
        label:        aiResult.label,
        routine_json: JSON.stringify(aiResult),
      })
      setSavedOk(true)
      fetchRoutines()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function resetWizard() {
    setWizardStep(0)
    setWizardAnswers({})
    setAiResult(null)
    setAiError(null)
    setSavedOk(false)
  }

  const activeRoutine = routines.find(r => r.id === activeId)

  return (
    <PageContainer>
      <TopBar title="Gym" />

      {/* Chips */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="chips-scroll" role="tablist" aria-label="Secciones de entrenamiento">
          {CHIPS.map(c => (
            <button
              key={c}
              role="tab"
              aria-selected={chip === c}
              onClick={() => setChip(c)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-all min-h-[44px] whitespace-nowrap',
                chip === c
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Rutinas ── */}
      {chip === 'Rutinas' && (
        <ScrollArea>
          {routinesLoading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
              <span className="text-sm text-zinc-500">Cargando rutinas…</span>
            </div>
          ) : routinesError ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
              <p className="text-sm text-red-400 mb-2">{routinesError}</p>
              <button onClick={fetchRoutines} className="flex items-center gap-1.5 mx-auto text-xs text-red-400 hover:underline">
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </button>
            </div>
          ) : routines.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center text-3xl">🏋️</div>
              <div>
                <p className="font-bold text-white mb-1">Sin rutinas guardadas</p>
                <p className="text-sm text-zinc-500">Genera tu primera rutina con IA o crea una manual.</p>
              </div>
              <button
                onClick={() => setChip('Rutinas IA')}
                className="px-5 py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px]"
              >
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Generar con IA</span>
              </button>
            </div>
          ) : (
            <>
              {/* Active routine hero */}
              {activeRoutine && (() => {
                let parsed: AIRoutine | null = null
                try { parsed = JSON.parse(activeRoutine.routine_json) } catch { /* ignore */ }
                return (
                  <div className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/25 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Rutina activa</p>
                    </div>
                    <p className="text-lg font-bold text-white mb-1">{activeRoutine.label}</p>
                    {parsed && (
                      <p className="text-xs text-zinc-500 mb-3">{parsed.days_per_week} días/sem · {parsed.focus_area}</p>
                    )}
                    <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[48px] flex items-center justify-center gap-2">
                      <Zap className="w-4 h-4" /> Empezar sesión
                    </button>
                  </div>
                )
              })()}

              {/* Routines list */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Mis rutinas</p>
              {routines.map(r => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  isActive={r.id === activeId}
                  onActivate={() => handleActivate(r.id)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}

              <button
                onClick={() => setChip('Rutinas IA')}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-zinc-700 text-zinc-500 hover:border-cyan-500/40 hover:text-cyan-400 transition-colors text-sm font-medium min-h-[52px]"
              >
                <Plus className="w-4 h-4" /> Nueva rutina con IA
              </button>
            </>
          )}
        </ScrollArea>
      )}

      {/* ── Tab: Ejercicios ── */}
      {chip === 'Ejercicios' && (
        <ScrollArea>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar ejercicio…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/40 min-h-[48px]"
            />
          </div>

          {/* Group filter chips */}
          <div className="chips-scroll">
            {GROUPS.map(g => (
              <button
                key={g}
                onClick={() => setGroupFilt(g)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap border',
                  groupFilt === g
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600',
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Exercise list */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">
            {filtered.length} ejercicio{filtered.length !== 1 ? 's' : ''}
          </p>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">No hay ejercicios para esta búsqueda</div>
          ) : (
            filtered.map(ex => (
              <div key={ex.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white text-sm">{ex.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {ex.group} · <span className="text-zinc-600">{ex.equipment}</span>
                  </p>
                </div>
                <span className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2.5 py-1 rounded-lg flex-shrink-0">{ex.sets}</span>
              </div>
            ))
          )}
        </ScrollArea>
      )}

      {/* ── Tab: Rutinas IA ── */}
      {chip === 'Rutinas IA' && (
        <ScrollArea>
          {/* Loading */}
          {aiLoading && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
              <p className="text-sm font-semibold text-white">Generando tu rutina personalizada…</p>
              <p className="text-xs text-zinc-500">Esto puede tardar unos segundos</p>
            </div>
          )}

          {/* Error */}
          {aiError && !aiLoading && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
              <p className="text-sm text-red-400 mb-3">{aiError}</p>
              <button onClick={resetWizard} className="text-xs text-red-400 hover:underline">Volver a intentar</button>
            </div>
          )}

          {/* Wizard */}
          {!aiLoading && !aiResult && !aiError && (
            <>
              <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-violet-300">Generador de rutinas IA</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Responde {WIZARD_STEPS.length} preguntas y recibirás un plan completamente personalizado.
                  </p>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2 py-1">
                {WIZARD_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i < wizardStep ? 'w-6 bg-cyan-500' :
                      i === wizardStep ? 'w-6 bg-cyan-400' :
                      'w-3 bg-zinc-700',
                    )}
                  />
                ))}
              </div>

              {/* Current step */}
              {(() => {
                const step = WIZARD_STEPS[wizardStep]
                return (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
                    <p className="text-sm font-bold text-white text-center mb-4">{step.question}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {step.options.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleWizardPick(step.key, opt.value)}
                          className={cn(
                            'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center min-h-[80px]',
                            wizardAnswers[step.key] === opt.value
                              ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600',
                          )}
                        >
                          <span className="text-2xl">{opt.emoji}</span>
                          <span className="text-xs font-semibold">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    {wizardStep > 0 && (
                      <button
                        onClick={() => setWizardStep(s => s - 1)}
                        className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        ← Paso anterior
                      </button>
                    )}
                  </div>
                )
              })()}
            </>
          )}

          {/* Result */}
          {aiResult && !aiLoading && (
            <>
              <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Dumbbell className="w-4 h-4 text-violet-400" />
                  <p className="text-sm font-bold text-violet-300">{aiResult.label}</p>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{aiResult.description}</p>
                <div className="flex gap-3 mt-3">
                  <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-700">
                    {aiResult.days_per_week} días/sem
                  </span>
                  <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-700">
                    {aiResult.focus_area}
                  </span>
                </div>
              </div>

              {aiResult.days.map((day, di) => (
                <div key={di} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-zinc-800/50 flex items-center justify-between">
                    <p className="text-sm font-bold text-white">{day.day_label}</p>
                    <span className="text-xs text-cyan-400 font-semibold">{day.focus}</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2.5">
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{ex.name}</p>
                          <p className="text-[11px] text-zinc-500">{ex.muscle_group}{ex.notes ? ` · ${ex.notes}` : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-mono text-zinc-300">{ex.sets}×{ex.reps}</p>
                          <p className="text-[10px] text-zinc-600">{ex.rest_sec}s descanso</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={saveAiRoutine}
                  disabled={saving || savedOk}
                  className={cn(
                    'flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all min-h-[52px] flex items-center justify-center gap-2',
                    savedOk
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-gradient-to-r from-teal-500 to-cyan-400 text-white',
                  )}
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                  ) : savedOk ? (
                    <><CheckCircle2 className="w-4 h-4" /> Guardada</>
                  ) : (
                    'Guardar rutina'
                  )}
                </button>
                <button
                  onClick={resetWizard}
                  className="px-4 py-3.5 rounded-2xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors min-h-[52px] flex items-center justify-center"
                  aria-label="Regenerar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </ScrollArea>
      )}
    </PageContainer>
  )
}
