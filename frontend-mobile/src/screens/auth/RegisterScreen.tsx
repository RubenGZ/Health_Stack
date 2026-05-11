import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff } from 'lucide-react'
import { register } from '@/services/auth'
import { useAuthStore } from '@/store/authStore'

export function RegisterScreen() {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const navigate  = useNavigate()
  const setUser   = useAuthStore(s => s.setUser)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8)                             { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (!/[A-Z]/.test(password))                         { setError('Incluye al menos una mayúscula (A-Z)'); return }
    if (!/[a-z]/.test(password))                         { setError('Incluye al menos una minúscula (a-z)'); return }
    if (!/[0-9]/.test(password))                         { setError('Incluye al menos un número (0-9)'); return }
    if (!/[!@#$%^&*()_+\-=[\]{}|;':",./<>?]/.test(password)) { setError('Incluye al menos un carácter especial (!@#$%...)'); return }
    setError(null)
    setLoading(true)
    try {
      // register() now calls login() internally — returns the logged-in user
      const user = await register(email, password, name || null)
      setUser(user)
      navigate('/auth/onboarding', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full auth-gradient-bg flex flex-col justify-center px-6 py-12" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mb-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center mx-auto mb-4 shadow-[0_4px_20px_rgba(8,145,178,0.4)]">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white font-heading">Crear cuenta</h1>
        <p className="text-zinc-500 text-sm mt-1">Gratis para siempre</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name — optional */}
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">
            Nombre <span className="text-zinc-600 normal-case font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="name"
            placeholder="Tu nombre"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[48px]"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="tu@email.com"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[48px]"
          />
        </div>

        {/* Password + show/hide toggle */}
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">Contraseña</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mín. 8 caracteres"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[48px]"
            />
            <button
              type="button"
              onClick={() => setShowPw(p => !p)}
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={showPw}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600 leading-snug">
            Mín. 8 caracteres · mayúscula · minúscula · número · carácter especial (!@#…)
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white font-bold text-sm uppercase tracking-widest shadow-[0_4px_20px_rgba(8,145,178,0.35)] disabled:opacity-50 min-h-[48px] transition-opacity"
        >
          {loading ? 'Creando cuenta…' : 'Crear cuenta gratis'}
        </button>
      </form>

      <p className="text-center text-zinc-500 text-sm mt-8">
        ¿Ya tienes cuenta?{' '}
        <Link to="/auth/login" className="text-cyan-400 font-semibold hover:underline">Inicia sesión</Link>
      </p>
    </div>
  )
}
