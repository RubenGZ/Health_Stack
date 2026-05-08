import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { register } from '@/services/auth'

export function RegisterScreen() {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setError(null)
    setLoading(true)
    try {
      await register(email, password, name)
      navigate('/auth/login', { state: { registered: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-zinc-950 flex flex-col justify-center px-6 py-12" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mb-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-400 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white font-heading">Crear cuenta</h1>
        <p className="text-zinc-500 text-sm mt-1">Gratis para siempre</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Nombre', value: name,     setter: setName,     type: 'text',     auto: 'name',          placeholder: 'Tu nombre' },
          { label: 'Email',  value: email,    setter: setEmail,    type: 'email',    auto: 'email',         placeholder: 'tu@email.com' },
          { label: 'Contraseña', value: password, setter: setPassword, type: 'password', auto: 'new-password', placeholder: '8 caracteres mínimo' },
        ].map(({ label, value, setter, type, auto, placeholder }) => (
          <div key={label}>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block">{label}</label>
            <input
              type={type}
              value={value}
              onChange={e => setter(e.target.value)}
              required
              autoComplete={auto}
              placeholder={placeholder}
              minLength={type === 'password' ? 8 : undefined}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[48px]"
            />
          </div>
        ))}

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
