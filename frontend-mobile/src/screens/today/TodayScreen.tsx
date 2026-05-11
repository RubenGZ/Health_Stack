import { useAuthStore } from '@/store/authStore'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { Bell, TrendingDown, Flame, Zap, Dumbbell, Brain } from 'lucide-react'

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function TodayScreen() {
  const user = useAuthStore(s => s.user)
  const displayName = user?.display_name ?? user?.email?.split('@')[0] ?? 'atleta'

  const hour = new Date().getHours()
  const greeting = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

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
        {/* Hero: Racha + XP */}
        <div className="bg-gradient-to-r from-cyan-500/15 to-teal-500/10 border border-cyan-500/25 rounded-2xl p-4 card-glow-cyan">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-white">7 días de racha</span>
            </div>
            <span className="text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-full font-semibold">Nivel 4</span>
          </div>
          <ProgressBar value={340} max={500} colorClass="bg-gradient-to-r from-teal-500 to-cyan-400" />
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-zinc-500">340 XP</span>
            <span className="text-[10px] text-zinc-500">500 XP · Nivel 5</span>
          </div>
        </div>

        {/* Peso hoy */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Peso hoy</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-white tracking-tight">75.2 <span className="text-base text-zinc-500 font-normal">kg</span></p>
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                -0.3 kg desde ayer
              </p>
            </div>
            <button className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[44px] shadow-[0_2px_10px_rgba(8,145,178,0.3)]">
              Registrar
            </button>
          </div>
        </div>

        {/* Macros del día */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Macros de hoy</p>
          {[
            { label: 'Calorías', value: 1240, max: 2100, colorClass: 'bg-orange-400', display: '1 240 / 2 100 kcal' },
            { label: 'Proteína', value: 80,   max: 160,  colorClass: 'bg-sky-400',    display: '80 / 160 g' },
            { label: 'Carbos',   value: 140,  max: 240,  colorClass: 'bg-cyan-500',   display: '140 / 240 g' },
            { label: 'Grasa',    value: 35,   max: 65,   colorClass: 'bg-purple-400', display: '35 / 65 g' },
          ].map(m => (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-zinc-400 font-medium">{m.label}</span>
                <span className="text-zinc-400">{m.display}</span>
              </div>
              <ProgressBar value={m.value} max={m.max} colorClass={m.colorClass} />
            </div>
          ))}
        </div>

        {/* Entrenamiento hoy */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-cyan-400" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entrenamiento hoy</p>
            </div>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">FULL BODY A</span>
          </div>
          <p className="text-sm text-zinc-300 mb-2">8 ejercicios · ~45 min</p>
          <ProgressBar value={3} max={8} colorClass="bg-gradient-to-r from-teal-500 to-cyan-400" />
          <div className="flex justify-between mt-1.5 mb-3">
            <span className="text-[10px] text-zinc-600">3 / 8 ejercicios</span>
            <span className="text-[10px] text-zinc-600">37%</span>
          </div>
          <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[48px] shadow-[0_2px_12px_rgba(8,145,178,0.3)]">
            Continuar entrenamiento →
          </button>
        </div>

        {/* AI Insight */}
        <div className="bg-zinc-900 border border-violet-500/20 rounded-2xl p-4 card-glow-violet">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">IA Insight del día</p>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Tu peso bajó 0.8 kg esta semana — buen ritmo. Hoy te faltan 80 g de proteína. Prioriza fuentes magras en la cena.
          </p>
        </div>

        {/* Pasos del día — stat rápido */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Pasos</p>
            <p className="text-xl font-bold text-white">6 240</p>
            <p className="text-xs text-zinc-600 mt-0.5">/ 10 000 objetivo</p>
            <ProgressBar value={6240} max={10000} colorClass="bg-green-400" />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Agua</p>
            <p className="text-xl font-bold text-white">1.4 <span className="text-sm font-normal text-zinc-500">L</span></p>
            <p className="text-xs text-zinc-600 mt-0.5">/ 2.5 L objetivo</p>
            <ProgressBar value={1.4} max={2.5} colorClass="bg-blue-400" />
          </div>
        </div>

        {/* Quick action: XP earned */}
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">+50 XP por completar el desayuno</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sigue así y llegarás al nivel 5 en 3 días</p>
          </div>
        </div>
      </ScrollArea>
    </PageContainer>
  )
}
