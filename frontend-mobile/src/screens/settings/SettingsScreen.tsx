import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, Trash2, Monitor, User, Mail, Shield, Bell,
  ChevronRight, ExternalLink, Info,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { useAuthStore } from '@/store/authStore'
import { logout } from '@/services/auth'

/* ── SectionHeader ──────────────────────────────────────────── */
function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">
      {label}
    </p>
  )
}

/* ── SettingsRow ────────────────────────────────────────────── */
function SettingsRow({
  icon,
  label,
  sub,
  value,
  onClick,
  danger = false,
  external = false,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  value?: string
  onClick?: () => void
  danger?: boolean
  external?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl transition-colors min-h-[56px] ${
        danger
          ? 'hover:border-red-500/40 hover:bg-red-500/5'
          : 'hover:border-zinc-700'
      }`}
    >
      <span className={`flex-shrink-0 ${danger ? 'text-red-400' : 'text-zinc-400'}`}>
        {icon}
      </span>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold ${danger ? 'text-red-400' : 'text-white'}`}>
          {label}
        </p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
      {value && <span className="text-xs text-zinc-500 truncate max-w-[120px]">{value}</span>}
      {external ? (
        <ExternalLink className="w-4 h-4 text-zinc-600 flex-shrink-0" />
      ) : onClick ? (
        <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
      ) : null}
    </button>
  )
}

/* ── ConfirmModal ───────────────────────────────────────────── */
function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onCancel} />
      <div className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl">
        <p className="text-base font-bold text-white text-center">{title}</p>
        <p className="text-sm text-zinc-400 text-center leading-relaxed">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-zinc-800 text-sm font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
              danger
                ? 'bg-red-500 hover:bg-red-400 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Main screen ────────────────────────────────────────────── */
export function SettingsScreen() {
  const user      = useAuthStore(s => s.user)
  const clearUser = useAuthStore(s => s.clearUser)
  const navigate  = useNavigate()

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [confirmClear,  setConfirmClear]  = useState(false)
  const [cleared, setCleared] = useState(false)

  const displayName = user?.display_name ?? user?.email?.split('@')[0] ?? 'Atleta'

  function handleLogout() {
    logout()
    clearUser()
    navigate('/auth/login', { replace: true })
  }

  function handleClearLocal() {
    // Remove app-specific keys, keep auth tokens
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('hs_plan_') || key.startsWith('hs_local_id') || key.startsWith('hs_prefer_'))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
    setCleared(true)
    setConfirmClear(false)
  }

  const appVersion = '1.0.0-beta'

  return (
    <PageContainer>
      <TopBar back title="Ajustes" />

      <ScrollArea>
        {/* ── Account info ── */}
        <SectionHeader label="Cuenta" />

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {displayName[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{displayName}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-zinc-800 rounded-full text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              {user?.role ?? 'free'}
            </span>
          </div>
        </div>

        <SettingsRow
          icon={<User className="w-4 h-4" />}
          label="Nombre de usuario"
          value={displayName}
        />
        <SettingsRow
          icon={<Mail className="w-4 h-4" />}
          label="Correo electrónico"
          value={user?.email ?? '—'}
        />

        {/* ── Notifications (placeholder) ── */}
        <SectionHeader label="Notificaciones" />
        <SettingsRow
          icon={<Bell className="w-4 h-4" />}
          label="Notificaciones"
          sub="Próximamente disponible"
        />

        {/* ── Privacy ── */}
        <SectionHeader label="Privacidad y datos" />
        <SettingsRow
          icon={<Shield className="w-4 h-4" />}
          label="Datos biométricos"
          sub="Cifrados con AES-256 · RGPD compliant"
        />
        <SettingsRow
          icon={<Trash2 className="w-4 h-4" />}
          label={cleared ? '✓ Datos locales eliminados' : 'Borrar datos locales'}
          sub="Elimina planes de comida y preferencias guardados"
          onClick={() => setConfirmClear(true)}
          danger={!cleared}
        />

        {/* ── App ── */}
        <SectionHeader label="Aplicación" />
        <SettingsRow
          icon={<Monitor className="w-4 h-4" />}
          label="Ver versión escritorio"
          onClick={() => {
            localStorage.setItem('hs_prefer_desktop', 'true')
            window.location.href = '/'
          }}
          external
        />
        <SettingsRow
          icon={<Info className="w-4 h-4" />}
          label="Versión"
          value={appVersion}
        />

        {/* ── Session ── */}
        <SectionHeader label="Sesión" />
        <SettingsRow
          icon={<LogOut className="w-4 h-4" />}
          label="Cerrar sesión"
          sub={`Sesión activa como ${user?.email}`}
          onClick={() => setConfirmLogout(true)}
          danger
        />
      </ScrollArea>

      {/* ── Confirm Logout ── */}
      {confirmLogout && (
        <ConfirmModal
          title="¿Cerrar sesión?"
          description="Tendrás que volver a iniciar sesión para acceder a tu cuenta."
          confirmLabel="Cerrar sesión"
          danger
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}

      {/* ── Confirm Clear Local ── */}
      {confirmClear && (
        <ConfirmModal
          title="¿Borrar datos locales?"
          description="Se eliminarán los planes de comida guardados en este dispositivo. Tus datos de cuenta y registros en servidor no se ven afectados."
          confirmLabel="Borrar"
          danger
          onConfirm={handleClearLocal}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </PageContainer>
  )
}
