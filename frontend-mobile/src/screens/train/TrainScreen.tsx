import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { cn } from '@/lib/utils'

const CHIPS = ['Rutinas', 'Ejercicios', 'Rutinas IA']

const ROUTINES = [
  { name: 'Full Body A', days: 3, exercises: 8, duration: '45 min', active: true },
  { name: 'Push Pull Legs', days: 6, exercises: 18, duration: '60 min', active: false },
  { name: 'Upper / Lower', days: 4, exercises: 12, duration: '50 min', active: false },
]

const EXERCISES = [
  { name: 'Press de banca', group: 'Pecho', sets: '4×8-10' },
  { name: 'Sentadilla', group: 'Pierna', sets: '4×6-8' },
  { name: 'Peso muerto', group: 'Espalda', sets: '3×5' },
  { name: 'Press militar', group: 'Hombro', sets: '4×8-12' },
  { name: 'Dominadas', group: 'Espalda', sets: '3×máx' },
  { name: 'Curl bíceps', group: 'Bíceps', sets: '3×12' },
]

export function TrainScreen() {
  const [chip, setChip] = useState('Rutinas')

  return (
    <PageContainer>
      <TopBar title="Gym" />

      {/* Chips */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="chips-scroll">
          {CHIPS.map(c => (
            <button
              key={c}
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

      <ScrollArea>
        {chip === 'Rutinas' && (
          <>
            {/* Rutina activa */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/25 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Rutina activa</p>
                <span className="text-[10px] bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30">Día 1/3</span>
              </div>
              <p className="text-lg font-bold text-white mb-2">Full Body A</p>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                <div className="h-full w-[37%] bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full" />
              </div>
              <p className="text-[10px] text-zinc-500 mb-3">3 / 8 ejercicios · ~45 min</p>
              <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[48px]">
                Continuar
              </button>
            </div>

            {/* Lista de rutinas */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Mis rutinas</p>
            {ROUTINES.map(r => (
              <div key={r.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{r.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{r.days}d/sem · {r.exercises} ejercicios · {r.duration}</p>
                </div>
                <button className={cn(
                  'text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] border transition-all',
                  r.active
                    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                )}>
                  {r.active ? 'Activa' : 'Usar'}
                </button>
              </div>
            ))}
          </>
        )}

        {chip === 'Ejercicios' && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Catálogo</p>
            {EXERCISES.map(ex => (
              <div key={ex.name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{ex.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{ex.group}</p>
                </div>
                <span className="text-xs text-zinc-400 font-mono bg-zinc-800 px-2.5 py-1 rounded-lg">{ex.sets}</span>
              </div>
            ))}
          </>
        )}

        {chip === 'Rutinas IA' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
            <p className="text-3xl mb-3">🤖</p>
            <p className="font-bold text-white mb-1">Genera tu rutina con IA</p>
            <p className="text-sm text-zinc-500 mb-4">Responde 7 preguntas y obtendrás un plan personalizado Full Body, PPL o Upper/Lower.</p>
            <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold rounded-xl min-h-[48px]">
              Generar rutina IA
            </button>
          </div>
        )}
      </ScrollArea>
    </PageContainer>
  )
}
