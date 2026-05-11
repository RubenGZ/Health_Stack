/**
 * NutritionScreen.tsx
 * =====================
 * Full nutrition hub: Planner (meal plan by day), Recipes (CRUD),
 * TDEE calculator, and Supplements (live from backend).
 *
 * Meal plan is persisted in localStorage keyed by date.
 * Recipes use user_local_id (localStorage UUID) — no JWT needed.
 * Supplements and Ingredients are fetched from the backend.
 */

import { useState, useEffect, type FormEvent } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import {
  Plus, BarChart2, X, ChevronDown, Trash2, Loader2,
  Search, BookOpen, Zap, Pill, FlaskConical,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MealEntry { name: string; kcal: number; protein?: number }
interface DayPlan { breakfast: MealEntry[]; mid: MealEntry[]; lunch: MealEntry[]; snack: MealEntry[]; dinner: MealEntry[] }
type MealKey = keyof DayPlan

interface SupplementResp {
  id: number; name: string; dose: string; timing: string
  description: string; icon_emoji: string | null; evidence_level: string
}
interface IngredientResp {
  id: number; name: string; category: string
  protein: number; carbs: number; fat: number; calories: number
}
interface RecipeResp {
  id: number; name: string; category: string
  total_calories: number; total_protein: number; total_carbs: number; total_fat: number
  ingredients_json: Array<{ name: string; grams: number }>
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
// JS getDay(): 0=Sun,1=Mon..6=Sat → our index: Mon=0..Sun=6
function todayIndex() { return (new Date().getDay() + 6) % 7 }
function dateKey(dayIdx: number): string {
  const d = new Date()
  const jsDay = d.getDay()
  const todayIdx = (jsDay + 6) % 7
  const diff = dayIdx - todayIdx
  const t = new Date(d); t.setDate(d.getDate() + diff)
  return t.toISOString().slice(0, 10)
}

const EMPTY_DAY = (): DayPlan => ({ breakfast: [], mid: [], lunch: [], snack: [], dinner: [] })

const MEAL_META: Record<MealKey, { label: string; emoji: string }> = {
  breakfast: { label: 'Desayuno',      emoji: '🌅' },
  mid:       { label: 'Media mañana',  emoji: '☀️' },
  lunch:     { label: 'Almuerzo',      emoji: '🥗' },
  snack:     { label: 'Merienda',      emoji: '🍎' },
  dinner:    { label: 'Cena',          emoji: '🌙' },
}

function getLocalId(): string {
  let id = localStorage.getItem('hs_local_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('hs_local_id', id)
  }
  return id
}

function loadDayPlan(date: string): DayPlan {
  try {
    const raw = localStorage.getItem(`hs_plan_${date}`)
    return raw ? JSON.parse(raw) : EMPTY_DAY()
  } catch { return EMPTY_DAY() }
}

function saveDayPlan(date: string, plan: DayPlan) {
  localStorage.setItem(`hs_plan_${date}`, JSON.stringify(plan))
}

// ── Activity multipliers for TDEE ─────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { value: 1.2,   label: 'Sedentario (sin ejercicio)' },
  { value: 1.375, label: 'Ligero (1-3 días/semana)' },
  { value: 1.55,  label: 'Moderado (3-5 días/semana)' },
  { value: 1.725, label: 'Activo (6-7 días/semana)' },
  { value: 1.9,   label: 'Muy activo (2× al día)' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Add-Meal Bottom Sheet ─────────────────────────────────────────────────────

interface AddMealSheetProps {
  mealKey: MealKey
  mealLabel: string
  recipes: RecipeResp[]
  onAdd: (entry: MealEntry) => void
  onClose: () => void
}

function AddMealSheet({ mealLabel, recipes, onAdd, onClose }: AddMealSheetProps) {
  const [tab, setTab]         = useState<'quick' | 'recipe'>('quick')
  const [name, setName]       = useState('')
  const [kcal, setKcal]       = useState('')
  const [protein, setProtein] = useState('')
  const [search, setSearch]   = useState('')

  const filtered = recipes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  function handleQuickAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !kcal) return
    onAdd({ name: name.trim(), kcal: Number(kcal), protein: protein ? Number(protein) : undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full bg-zinc-900 border-t border-zinc-700 rounded-t-3xl pb-safe pt-2 z-10"
           style={{ maxHeight: '80vh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        {/* Handle */}
        <div className="mx-auto w-10 h-1 bg-zinc-700 rounded-full mb-4" />

        <div className="px-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-white">Añadir a {mealLabel}</p>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            {(['quick', 'recipe'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                  tab === t
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                )}>
                {t === 'quick' ? 'Entrada rápida' : 'Desde recetas'}
              </button>
            ))}
          </div>

          {tab === 'quick' && (
            <form onSubmit={handleQuickAdd} className="space-y-3" style={{ overflowY: 'auto', maxHeight: '50vh' }}>
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Nombre del alimento</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ej: Pollo a la plancha"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Calorías (kcal)</label>
                  <input type="number" value={kcal} onChange={e => setKcal(e.target.value)} required placeholder="320" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Proteína (g) <span className="text-zinc-600 font-normal normal-case">(opcional)</span></label>
                  <input type="number" value={protein} onChange={e => setProtein(e.target.value)} placeholder="25" min="0"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
                </div>
              </div>
              <button type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px] shadow-[0_2px_10px_rgba(8,145,178,0.3)]">
                Añadir al planner
              </button>
            </form>
          )}

          {tab === 'recipe' && (
            <div style={{ overflowY: 'auto', maxHeight: '50vh' }} className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar receta…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
              </div>
              {filtered.length === 0 && (
                <p className="text-center text-zinc-500 text-sm py-6">
                  {recipes.length === 0 ? 'Aún no tienes recetas guardadas. Crea una en la pestaña Recetas.' : 'Sin resultados'}
                </p>
              )}
              {filtered.map(r => (
                <button key={r.id} onClick={() => onAdd({ name: r.name, kcal: Math.round(r.total_calories), protein: Math.round(r.total_protein) })}
                  className="w-full text-left flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 hover:border-cyan-500/40 transition-all min-h-[56px]">
                  <div>
                    <p className="text-sm font-semibold text-white">{r.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{Math.round(r.total_calories)} kcal · {Math.round(r.total_protein)}g prot</p>
                  </div>
                  <Plus className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Planner Tab ────────────────────────────────────────────────────────────────

function PlannerTab({ recipes }: { recipes: RecipeResp[] }) {
  const [activeDay, setDay]   = useState(todayIndex)
  const [plans, setPlans]     = useState<Record<string, DayPlan>>({})
  const [sheet, setSheet]     = useState<MealKey | null>(null)

  // Load plan for a day when selected
  useEffect(() => {
    const key = dateKey(activeDay)
    if (!plans[key]) setPlans(p => ({ ...p, [key]: loadDayPlan(key) }))
  }, [activeDay])

  const date   = dateKey(activeDay)
  const plan   = plans[date] ?? EMPTY_DAY()
  const totalKcal   = (Object.values(plan) as MealEntry[][]).flat().reduce((s, e) => s + e.kcal, 0)
  const totalProtein = (Object.values(plan) as MealEntry[][]).flat().reduce((s, e) => s + (e.protein ?? 0), 0)

  function addEntry(mealKey: MealKey, entry: MealEntry) {
    const next = { ...plan, [mealKey]: [...plan[mealKey], entry] }
    setPlans(p => ({ ...p, [date]: next }))
    saveDayPlan(date, next)
    setSheet(null)
  }

  function removeEntry(mealKey: MealKey, idx: number) {
    const next = { ...plan, [mealKey]: plan[mealKey].filter((_, i) => i !== idx) }
    setPlans(p => ({ ...p, [date]: next }))
    saveDayPlan(date, next)
  }

  return (
    <>
      {/* Day selector */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex gap-1.5 justify-between">
          {DAYS.map((d, i) => (
            <button key={d} aria-label={DAY_FULL[i]} onClick={() => setDay(i)}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px] relative',
                activeDay === i
                  ? 'bg-gradient-to-b from-teal-500 to-cyan-500 text-white shadow-[0_2px_10px_rgba(8,145,178,0.4)]'
                  : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
              )}>
              {d}
              {i === todayIndex() && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" aria-hidden />
              )}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 text-center mt-1">{DAY_FULL[activeDay]}</p>
      </div>

      <ScrollArea>
        {(Object.keys(MEAL_META) as MealKey[]).map(mealKey => {
          const { label, emoji } = MEAL_META[mealKey]
          const entries = plan[mealKey]
          return (
            <div key={mealKey} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-zinc-300">{emoji} {label}</p>
                <button
                  aria-label={`Añadir a ${label}`}
                  onClick={() => setSheet(mealKey)}
                  className="p-1.5 text-zinc-500 hover:text-cyan-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {entries.length === 0
                ? <p className="text-xs text-zinc-600 italic">Sin planear — toca + para añadir</p>
                : (
                  <div className="space-y-1.5">
                    {entries.map((e, i) => (
                      <div key={i} className="flex items-center justify-between group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{e.name}</p>
                          <p className="text-xs text-zinc-500">
                            {e.kcal} kcal{e.protein != null ? ` · ${e.protein}g prot` : ''}
                          </p>
                        </div>
                        <button onClick={() => removeEntry(mealKey, i)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )
        })}

        {/* Daily summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Resumen del día</p>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-zinc-400">Calorías</span>
              <span className="text-zinc-300">{totalKcal} / 2 100 kcal</span>
            </div>
            <ProgressBar value={totalKcal} max={2100} colorClass="bg-orange-400" />
          </div>
          {totalProtein > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-400">Proteína</span>
                <span className="text-zinc-300">{totalProtein}g / 160g</span>
              </div>
              <ProgressBar value={totalProtein} max={160} colorClass="bg-sky-400" />
            </div>
          )}
        </div>
      </ScrollArea>

      {sheet && (
        <AddMealSheet
          mealKey={sheet}
          mealLabel={MEAL_META[sheet].label}
          recipes={recipes}
          onAdd={entry => addEntry(sheet, entry)}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}

// ── Recipes Tab ────────────────────────────────────────────────────────────────

function RecipesTab() {
  const [recipes, setRecipes]     = useState<RecipeResp[]>([])
  const [ingredients, setIngredients] = useState<IngredientResp[]>([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Create form state
  const [rName, setRName]         = useState('')
  const [rCategory, setRCategory] = useState('almuerzo')
  const [rInstructions, setRInstructions] = useState('')
  const [rIngrs, setRIngrs]       = useState<Array<{ id: number; name: string; grams: string }>>([])
  const [ingSearch, setIngSearch] = useState('')
  const [saving, setSaving]       = useState(false)

  const localId = getLocalId()

  useEffect(() => {
    Promise.all([
      api.get<RecipeResp[]>(`/api/v1/nutrition/recipes?local_id=${localId}`),
      api.get<IngredientResp[]>('/api/v1/nutrition/ingredients'),
    ]).then(([r, i]) => { setRecipes(r); setIngredients(i) })
      .catch(() => setError('No se pudieron cargar las recetas'))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!rName.trim() || rIngrs.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const created = await api.post<RecipeResp>('/api/v1/nutrition/recipes', {
        user_local_id: localId,
        name: rName.trim(),
        category: rCategory,
        instructions: rInstructions || null,
        ingredients: rIngrs.map(i => ({ ingredient_id: i.id, name: i.name, grams: Number(i.grams) })),
      })
      setRecipes(r => [created, ...r])
      setShowCreate(false)
      setRName(''); setRCategory('almuerzo'); setRInstructions(''); setRIngrs([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la receta')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/api/v1/nutrition/recipes/${id}`)
      setRecipes(r => r.filter(x => x.id !== id))
    } catch { setError('Error al eliminar la receta') }
  }

  const filteredIngredients = ingredients.filter(i =>
    i.name.toLowerCase().includes(ingSearch.toLowerCase())
  ).slice(0, 20)

  if (loading) return (
    <ScrollArea className="flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
    </ScrollArea>
  )

  return (
    <ScrollArea>
      {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}

      {/* Create button */}
      <button onClick={() => setShowCreate(s => !s)}
        className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px] shadow-[0_2px_10px_rgba(8,145,178,0.3)]">
        <Plus className="w-4 h-4" />
        {showCreate ? 'Cancelar' : 'Nueva receta'}
      </button>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="font-bold text-white text-sm">Nueva receta</p>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Nombre</label>
            <input value={rName} onChange={e => setRName(e.target.value)} required placeholder="Ej: Bowl de pollo y arroz"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Categoría</label>
            <div className="relative">
              <select value={rCategory} onChange={e => setRCategory(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm appearance-none">
                {['desayuno','almuerzo','cena','snack','pre','post'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Ingredient search + add */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
              Ingredientes ({rIngrs.length})
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={ingSearch} onChange={e => setIngSearch(e.target.value)} placeholder="Buscar ingrediente…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
            </div>
            {ingSearch && (
              <div className="bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden mb-2 max-h-40 overflow-y-auto">
                {filteredIngredients.map(i => (
                  <button key={i.id} type="button"
                    onClick={() => {
                      if (!rIngrs.find(x => x.id === i.id)) {
                        setRIngrs(r => [...r, { id: i.id, name: i.name, grams: '100' }])
                      }
                      setIngSearch('')
                    }}
                    className="w-full text-left flex items-center justify-between px-3 py-2.5 hover:bg-zinc-700 transition-colors border-b border-zinc-700 last:border-0">
                    <span className="text-sm text-white">{i.name}</span>
                    <span className="text-xs text-zinc-500">{i.calories} kcal/100g</span>
                  </button>
                ))}
              </div>
            )}
            {rIngrs.map((ing, idx) => (
              <div key={ing.id} className="flex items-center gap-2 mb-2">
                <span className="flex-1 text-sm text-zinc-300 truncate">{ing.name}</span>
                <input type="number" value={ing.grams} min="1" max="5000"
                  onChange={e => setRIngrs(r => r.map((x, i) => i === idx ? { ...x, grams: e.target.value } : x))}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-cyan-600 text-center" />
                <span className="text-xs text-zinc-500">g</span>
                <button type="button" onClick={() => setRIngrs(r => r.filter((_, i) => i !== idx))}
                  className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {rIngrs.length === 0 && !ingSearch && (
              <p className="text-xs text-zinc-600 italic">Busca y añade ingredientes arriba</p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Instrucciones <span className="text-zinc-600 font-normal normal-case">(opcional)</span></label>
            <textarea value={rInstructions} onChange={e => setRInstructions(e.target.value)}
              placeholder="Pasos de preparación…" rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 text-sm resize-none" />
          </div>

          <button type="submit" disabled={saving || !rName.trim() || rIngrs.length === 0}
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px] disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </form>
      )}

      {/* Recipe list */}
      {recipes.length === 0 && !showCreate && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <BookOpen className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">Aún no tienes recetas guardadas.</p>
          <p className="text-zinc-600 text-xs mt-1">Toca "Nueva receta" para crear la primera.</p>
        </div>
      )}
      {recipes.map(r => (
        <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{r.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5 capitalize">{r.category}</p>
            </div>
            <button onClick={() => handleDelete(r.id)}
              className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { label: 'kcal', value: Math.round(r.total_calories), color: 'text-orange-400' },
              { label: 'prot', value: `${Math.round(r.total_protein)}g`, color: 'text-sky-400' },
              { label: 'carbs', value: `${Math.round(r.total_carbs)}g`, color: 'text-cyan-400' },
              { label: 'grasa', value: `${Math.round(r.total_fat)}g`, color: 'text-purple-400' },
            ].map(m => (
              <div key={m.label} className="bg-zinc-800 rounded-xl p-2 text-center">
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </ScrollArea>
  )
}

// ── TDEE Tab ───────────────────────────────────────────────────────────────────

function TDEETab() {
  const [sex, setSex]           = useState<'male' | 'female'>('male')
  const [weight, setWeight]     = useState('')
  const [height, setHeight]     = useState('')
  const [age, setAge]           = useState('')
  const [activity, setActivity] = useState(1.55)
  const [goal, setGoal]         = useState<'cut' | 'maintain' | 'bulk'>('maintain')
  const [result, setResult]     = useState<{ bmr: number; tdee: number; target: number } | null>(null)

  function calculate(e: FormEvent) {
    e.preventDefault()
    const w = Number(weight), h = Number(height), a = Number(age)
    const bmr = sex === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161
    const tdee = bmr * activity
    const delta = goal === 'cut' ? -400 : goal === 'bulk' ? 300 : 0
    setResult({ bmr: Math.round(bmr), tdee: Math.round(tdee), target: Math.round(tdee + delta) })
  }

  return (
    <ScrollArea>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="font-bold text-white text-sm">Calculadora TDEE</p>
        </div>
        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          TDEE = Total Daily Energy Expenditure. Las calorías que necesitas para mantener tu peso actual según tu nivel de actividad.
        </p>

        <form onSubmit={calculate} className="space-y-4">
          {/* Sex */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Sexo biológico</label>
            <div className="flex gap-2">
              {(['male', 'female'] as const).map(s => (
                <button key={s} type="button" onClick={() => setSex(s)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                    sex === s ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  )}>
                  {s === 'male' ? '♂ Masculino' : '♀ Femenino'}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          {[
            { label: 'Peso', state: weight, setter: setWeight, unit: 'kg', placeholder: '75' },
            { label: 'Altura', state: height, setter: setHeight, unit: 'cm', placeholder: '178' },
            { label: 'Edad', state: age, setter: setAge, unit: 'años', placeholder: '28' },
          ].map(({ label, state, setter, unit, placeholder }) => (
            <div key={label}>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">{label}</label>
              <div className="relative">
                <input type="number" value={state} onChange={e => setter(e.target.value)} required
                  placeholder={placeholder} inputMode="numeric" min="1"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 pr-14 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">{unit}</span>
              </div>
            </div>
          ))}

          {/* Activity */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Nivel de actividad</label>
            <div className="relative">
              <select value={activity} onChange={e => setActivity(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-600 min-h-[48px] text-sm appearance-none">
                {ACTIVITY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Objetivo</label>
            <div className="flex gap-2">
              {([
                { v: 'cut', label: '🔥 Perder grasa' },
                { v: 'maintain', label: '⚖️ Mantener' },
                { v: 'bulk', label: '💪 Ganar masa' },
              ] as const).map(({ v, label }) => (
                <button key={v} type="button" onClick={() => setGoal(v)}
                  className={cn('flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all',
                    goal === v ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px] shadow-[0_2px_10px_rgba(8,145,178,0.3)]">
            Calcular
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-zinc-900 border border-cyan-500/25 rounded-2xl p-4 space-y-3 card-glow-cyan">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Tus resultados</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'BMR', value: result.bmr, sub: 'en reposo', color: 'text-zinc-300' },
              { label: 'TDEE', value: result.tdee, sub: 'mantenimiento', color: 'text-white' },
              { label: 'Objetivo', value: result.target, sub: goal === 'cut' ? '-400 kcal' : goal === 'bulk' ? '+300 kcal' : '= TDEE', color: 'text-cyan-400' },
            ].map(r => (
              <div key={r.label} className="bg-zinc-800 rounded-xl p-3 text-center">
                <p className={`text-lg font-bold ${r.color}`}>{r.value}</p>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide">{r.label}</p>
                <p className="text-[9px] text-zinc-600">{r.sub}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Basado en la fórmula Mifflin-St Jeor. Ajusta ±100–200 kcal según tu progreso real en las primeras 2 semanas.
          </p>
        </div>
      )}
    </ScrollArea>
  )
}

// ── Supplements Tab ────────────────────────────────────────────────────────────

function SupplementsTab() {
  const [sups, setSups]     = useState<SupplementResp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    api.get<SupplementResp[]>('/api/v1/nutrition/supplements')
      .then(setSups)
      .catch(() => setError('No se pudieron cargar los suplementos'))
      .finally(() => setLoading(false))
  }, [])

  const EVIDENCE_COLOR: Record<string, string> = {
    A: 'text-green-400', B: 'text-cyan-400', C: 'text-yellow-400', D: 'text-zinc-500',
  }

  if (loading) return (
    <ScrollArea className="flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
    </ScrollArea>
  )

  return (
    <ScrollArea>
      {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}
      <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
        <FlaskConical className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        <p className="text-xs text-zinc-500 leading-snug">
          Evidencia: <span className="text-green-400">A</span>=sólida · <span className="text-cyan-400">B</span>=buena · <span className="text-yellow-400">C</span>=limitada · <span className="text-zinc-500">D</span>=débil
        </p>
      </div>
      {sups.length === 0 && !error && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
          <Pill className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm">No hay suplementos disponibles aún.</p>
        </div>
      )}
      {sups.map(s => (
        <div key={s.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-xl flex-shrink-0">
              {s.icon_emoji ?? '💊'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-white text-sm">{s.name}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 ${EVIDENCE_COLOR[s.evidence_level] ?? 'text-zinc-500'}`}>
                  Evid. {s.evidence_level}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">{s.dose} · {s.timing}</p>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{s.description}</p>
            </div>
          </div>
        </div>
      ))}
    </ScrollArea>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

const CHIPS = ['Planner', 'Recetas', 'TDEE', 'Suplementos'] as const
type ChipKey = typeof CHIPS[number]

export function NutritionScreen() {
  const [chip, setChip] = useState<ChipKey>('Planner')
  const [recipes, setRecipes] = useState<RecipeResp[]>([])

  // Pre-fetch recipes for the add-meal modal
  useEffect(() => {
    const localId = getLocalId()
    api.get<RecipeResp[]>(`/api/v1/nutrition/recipes?local_id=${localId}`)
      .then(setRecipes)
      .catch(() => {/* silent — modal will show empty state */})
  }, [])

  return (
    <PageContainer>
      <TopBar
        title="Comida"
        right={
          <button aria-label="Ver estadísticas de nutrición"
            className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
            <BarChart2 className="w-5 h-5" />
          </button>
        }
      />

      {/* Chips */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="chips-scroll" role="tablist" aria-label="Secciones de nutrición">
          {CHIPS.map(c => (
            <button key={c} role="tab" aria-selected={chip === c} onClick={() => setChip(c)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-all min-h-[44px] whitespace-nowrap',
                chip === c
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
              )}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {chip === 'Planner'    && <PlannerTab recipes={recipes} />}
      {chip === 'Recetas'    && <RecipesTab />}
      {chip === 'TDEE'       && <TDEETab />}
      {chip === 'Suplementos' && <SupplementsTab />}
    </PageContainer>
  )
}
