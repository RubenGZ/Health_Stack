import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { cn } from '@/lib/utils'
import { Plus, BarChart2 } from 'lucide-react'

const CHIPS = ['Planner', 'Recetas', 'TDEE', 'Suplementos']
const DAYS = [
  { short: 'L', full: 'Lunes' },
  { short: 'M', full: 'Martes' },
  { short: 'X', full: 'Miércoles' },
  { short: 'J', full: 'Jueves' },
  { short: 'V', full: 'Viernes' },
  { short: 'S', full: 'Sábado' },
  { short: 'D', full: 'Domingo' },
]
const MEALS = [
  { id: 'breakfast', label: '🌅 Desayuno',      recipe: 'Tortilla de claras', kcal: 320 },
  { id: 'mid',       label: '☀️ Media mañana',  recipe: null,                 kcal: null },
  { id: 'lunch',     label: '🥗 Almuerzo',       recipe: 'Pollo con arroz',    kcal: 520 },
  { id: 'snack',     label: '🍎 Merienda',       recipe: null,                 kcal: null },
  { id: 'dinner',    label: '🌙 Cena',           recipe: null,                 kcal: null },
]

export function NutritionScreen() {
  const [chip, setChip]     = useState('Planner')
  const [activeDay, setDay] = useState(3) // Jueves

  const totalKcal = MEALS.reduce((acc, m) => acc + (m.kcal ?? 0), 0)

  return (
    <PageContainer>
      <TopBar
        title="Comida"
        right={
          <button aria-label="Ver estadísticas de nutrición" className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center">
            <BarChart2 className="w-5 h-5" />
          </button>
        }
      />

      {/* Chips */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="chips-scroll" role="tablist" aria-label="Secciones de nutrición">
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
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {chip === 'Planner' && (
        <>
          {/* Day selector */}
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex gap-2 justify-between">
              {DAYS.map(({ short, full }, i) => (
                <button
                  key={short}
                  aria-label={full}
                  onClick={() => setDay(i)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px]',
                    activeDay === i
                      ? 'bg-gradient-to-b from-teal-500 to-cyan-500 text-white shadow-[0_2px_10px_rgba(8,145,178,0.4)]'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  {short}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea>
            {/* Comidas del día */}
            {MEALS.map(meal => (
              <div key={meal.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-zinc-300">{meal.label}</p>
                  <button aria-label={`Añadir a ${meal.label}`} className="p-1.5 text-zinc-500 hover:text-cyan-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {meal.recipe ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white">{meal.recipe}</p>
                    <span className="text-xs text-zinc-500">{meal.kcal} kcal</span>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 italic">Sin planear — toca + para añadir</p>
                )}
              </div>
            ))}

            {/* Resumen del día */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Macros del día</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">{totalKcal}</span>
                <span className="text-zinc-500 text-sm">kcal planificadas</span>
              </div>
            </div>
          </ScrollArea>
        </>
      )}

      {chip !== 'Planner' && (
        <ScrollArea>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <p className="text-zinc-500 text-sm">Sección <strong className="text-white">{chip}</strong> — próximamente</p>
          </div>
        </ScrollArea>
      )}
    </PageContainer>
  )
}
