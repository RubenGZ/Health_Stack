import { useAuthStore } from '@/store/authStore'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { Bell } from 'lucide-react'

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-600">{sub}</p>}
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
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
        {/* Racha y XP */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-cyan-400">🔥 Racha: 7 días</span>
            <span className="text-xs text-zinc-500">Nivel 4</span>
          </div>
          <ProgressBar value={340} max={500} color="bg-gradient-to-r from-teal-500 to-cyan-400" />
          <p className="text-[10px] text-zinc-600 mt-1.5">340 / 500 XP · 160 XP para nivel 5</p>
        </div>

        {/* Peso hoy */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Peso hoy</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-white">75.2 <span className="text-base text-zinc-500 font-normal">kg</span></p>
              <p className="text-xs text-green-400 mt-0.5">▼ -0.3 kg desde ayer</p>
            </div>
            <button className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[44px]">
              Registrar
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Calorías" value="1 240" sub="/ 2 100 kcal objetivo" color="text-orange-400" />
          <StatCard label="Proteína" value="80 g" sub="/ 160 g objetivo" color="text-sky-400" />
        </div>

        {/* Macros del día */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Macros hoy</p>
          {[
            { label: 'Calorías', value: 1240, max: 2100, color: 'bg-orange-400', pct: '59%' },
            { label: 'Proteína', value: 80,   max: 160,  color: 'bg-sky-400',    pct: '50%' },
            { label: 'Carbos',   value: 140,  max: 240,  color: 'bg-cyan-500',   pct: '58%' },
            { label: 'Grasa',    value: 35,   max: 65,   color: 'bg-purple-400', pct: '54%' },
          ].map(m => (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-400">{m.label}</span>
                <span className="text-zinc-300 font-medium">{m.pct}</span>
              </div>
              <ProgressBar value={m.value} max={m.max} color={m.color} />
            </div>
          ))}
        </div>

        {/* Entrenamiento hoy */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Entrenamiento hoy</p>
            <span className="text-[10px] text-cyan-400 font-bold">FULL BODY A</span>
          </div>
          <p className="text-sm text-zinc-300 mb-1">8 ejercicios · ~45 min</p>
          <ProgressBar value={3} max={8} color="bg-gradient-to-r from-teal-500 to-cyan-400" />
          <p className="text-[10px] text-zinc-600 mt-1.5">3 / 8 ejercicios completados</p>
          <button className="mt-3 w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-xs font-bold rounded-xl min-h-[48px]">
            Continuar entrenamiento
          </button>
        </div>

        {/* AI Insight */}
        <div className="bg-zinc-900 border border-cyan-500/20 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-2">🧠 AI Insight del día</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Tu peso bajó 0.8 kg esta semana. Buen ritmo para tu objetivo. Asegúrate de alcanzar los 160 g de proteína hoy.
          </p>
        </div>
      </ScrollArea>
    </PageContainer>
  )
}
