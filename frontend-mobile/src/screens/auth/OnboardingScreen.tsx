import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Goal = 'lose_fat' | 'gain_muscle' | 'maintain' | 'performance'

const GOALS: { value: Goal; label: string; emoji: string }[] = [
  { value: 'lose_fat',     label: 'Perder grasa',        emoji: '🔥' },
  { value: 'gain_muscle',  label: 'Ganar músculo',       emoji: '💪' },
  { value: 'maintain',     label: 'Mantener peso',       emoji: '⚖️' },
  { value: 'performance',  label: 'Mejorar rendimiento', emoji: '🏃' },
]

const TRAINING_DAYS = [2, 3, 4, 5, 6]

export function OnboardingScreen() {
  const [step, setStep]           = useState(1)
  const [goal, setGoal]           = useState<Goal | null>(null)
  const [weight, setWeight]       = useState('')
  const [height, setHeight]       = useState('')
  const [age, setAge]             = useState('')
  const [trainingDays, setDays]   = useState<number | null>(null)
  const navigate = useNavigate()

  function finish() {
    localStorage.setItem('hs_onboarded', 'true')
    localStorage.setItem('hs_onboarding', JSON.stringify({ goal, weight, height, age, trainingDays }))
    navigate('/app/today', { replace: true })
  }

  const progress = (step / 3) * 100

  return (
    <div className="min-h-full bg-zinc-950 flex flex-col px-6 py-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-zinc-500 mb-2">
          <span>Paso {step} de 3</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step 1: Objetivo */}
      {step === 1 && (
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white font-heading mb-2">¿Cuál es tu objetivo?</h2>
          <p className="text-zinc-500 text-sm mb-6">Personalizaremos tu experiencia según tu meta.</p>
          <div className="space-y-3">
            {GOALS.map(g => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={cn(
                  'w-full flex items-center gap-4 px-4 py-4 rounded-xl border text-left transition-all min-h-[60px]',
                  goal === g.value
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                )}
              >
                <span className="text-2xl">{g.emoji}</span>
                <span className="font-semibold">{g.label}</span>
                {goal === g.value && <span className="ml-auto text-cyan-400">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Cuerpo */}
      {step === 2 && (
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white font-heading mb-2">Tu cuerpo</h2>
          <p className="text-zinc-500 text-sm mb-6">Calcularemos tu TDEE y calorías objetivo.</p>
          <div className="space-y-4">
            {[
              { label: 'Peso', value: weight, setter: setWeight, unit: 'kg', placeholder: '75', type: 'number' },
              { label: 'Altura', value: height, setter: setHeight, unit: 'cm', placeholder: '178', type: 'number' },
              { label: 'Edad', value: age, setter: setAge, unit: 'años', placeholder: '28', type: 'number' },
            ].map(({ label, value, setter, unit, placeholder, type }) => (
              <div key={label}>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">{label}</label>
                <div className="relative">
                  <input
                    type={type}
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    inputMode="numeric"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 pr-14 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[48px]"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Días de entrenamiento */}
      {step === 3 && (
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white font-heading mb-2">¿Cuántos días entrenas?</h2>
          <p className="text-zinc-500 text-sm mb-6">Generaremos tu rutina óptima automáticamente.</p>
          <div className="flex gap-3 flex-wrap">
            {TRAINING_DAYS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'w-16 h-16 rounded-2xl text-xl font-bold border transition-all',
                  trainingDays === d
                    ? 'bg-gradient-to-br from-teal-500 to-cyan-400 border-transparent text-white shadow-[0_4px_14px_rgba(8,145,178,0.4)]'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-600'
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-zinc-500 text-xs mt-3">días por semana</p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8">
        <button
          onClick={step < 3 ? () => setStep(s => s + 1) : finish}
          disabled={
            (step === 1 && !goal) ||
            (step === 2 && (!weight || !height || !age)) ||
            (step === 3 && !trainingDays)
          }
          className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white font-bold text-sm uppercase tracking-widest shadow-[0_4px_20px_rgba(8,145,178,0.35)] disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px] flex items-center justify-center gap-2 transition-opacity"
        >
          {step < 3 ? 'Siguiente' : 'Empezar'}
          <ChevronRight className="w-4 h-4" />
        </button>
        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="w-full mt-3 py-3 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
          >
            Volver
          </button>
        )}
      </div>
    </div>
  )
}
