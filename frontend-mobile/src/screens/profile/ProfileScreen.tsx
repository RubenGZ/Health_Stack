import { useNavigate } from 'react-router-dom'
import { LogOut, Settings, ChevronRight, Monitor, MessageSquare, Users, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { useAuthStore } from '@/store/authStore'
import { logout } from '@/services/auth'

const BADGES = ['🥇', '🏃', '💪', '🎯', '🔥', '⚡']

function MenuRow({
  label,
  sub,
  icon,
  onClick,
  variant = 'default',
}: {
  label: string
  sub?: string
  icon?: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'highlight'
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-4 border rounded-2xl transition-colors min-h-[56px] ${
        variant === 'highlight'
          ? 'bg-violet-500/10 border-violet-500/30 hover:border-violet-500/50'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3 text-left">
        {icon && <span className="text-zinc-400">{icon}</span>}
        <div>
          <p className={`text-sm font-semibold ${variant === 'highlight' ? 'text-violet-300' : 'text-white'}`}>{label}</p>
          {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
    </button>
  )
}

export function ProfileScreen() {
  const user      = useAuthStore(s => s.user)
  const clearUser = useAuthStore(s => s.clearUser)
  const navigate  = useNavigate()

  function handleLogout() {
    logout()
    clearUser()
    navigate('/auth/login', { replace: true })
  }

  const displayName = user?.display_name ?? user?.email?.split('@')[0] ?? 'Atleta'
  const isAdmin = user?.role === 'admin'

  return (
    <PageContainer>
      <TopBar
        title="Perfil"
        right={
          <button
            aria-label="Ajustes"
            onClick={() => navigate('/app/settings')}
            className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Settings className="w-5 h-5" />
          </button>
        }
      />
      <ScrollArea>
        {/* Avatar + nivel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-[0_4px_14px_rgba(8,145,178,0.35)]">
            {displayName[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-lg truncate">{displayName}</p>
            <p className="text-xs text-zinc-500">
              {isAdmin ? '👑 Administrador' : 'Nivel 4 · Atleta en Forma'}
            </p>
            <p className="text-xs text-orange-400 mt-0.5">🔥 7 días de racha</p>
          </div>
        </div>

        {/* XP bar */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-zinc-400">XP Total</span>
            <span className="text-zinc-300 font-medium">340 / 500</span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full w-[68%] bg-gradient-to-r from-purple-500 to-violet-400 rounded-full" />
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5">160 XP para nivel 5</p>
        </div>

        {/* Badges */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Badges</p>
            <button className="text-xs text-cyan-400 hover:underline">Ver todos</button>
          </div>
          <div className="flex gap-3 flex-wrap">
            {BADGES.map((b, i) => (
              <div key={i} className="w-11 h-11 bg-zinc-800 rounded-xl flex items-center justify-center text-xl">
                {b}
              </div>
            ))}
          </div>
        </div>

        {/* Menú */}
        <MenuRow
          label="Asistente IA"
          sub="Chat con tu entrenador personal IA"
          icon={<MessageSquare className="w-4 h-4" />}
          onClick={() => navigate('/app/chat')}
          variant="highlight"
        />
        <MenuRow
          label="Comunidad"
          sub="Posts y leaderboard"
          icon={<Users className="w-4 h-4" />}
          onClick={() => navigate('/app/community')}
        />
        <MenuRow
          label="AI Insights"
          sub="Análisis de tus biomarcadores"
          icon={<Sparkles className="w-4 h-4" />}
          onClick={() => navigate('/app/insights')}
        />
        <MenuRow
          label="Ajustes"
          sub="Cuenta, notificaciones, privacidad"
          icon={<Settings className="w-4 h-4" />}
          onClick={() => navigate('/app/settings')}
        />

        {/* Versión escritorio */}
        <button
          onClick={() => {
            localStorage.setItem('hs_prefer_desktop', 'true')
            window.location.href = '/'
          }}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors min-h-[52px] text-sm font-medium"
        >
          <Monitor className="w-4 h-4" />
          Ver versión escritorio
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/20 text-red-400 hover:bg-red-500/5 transition-colors min-h-[52px] text-sm font-semibold"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </ScrollArea>
    </PageContainer>
  )
}
