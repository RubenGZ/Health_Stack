import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Send, Bot, Loader2 } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer } from '@/components/layout/PageContainer'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  reply: string
}

const SUGGESTIONS = [
  '¿Cuánta proteína necesito al día?',
  'Rutina para ganar músculo en casa',
  '¿Qué comer antes de entrenar?',
  'Explícame el ayuno intermitente',
]

export function ChatScreen() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const history = messages.slice(-10) // send last 10 turns for context
      const data = await api.post<ChatResponse>('/api/v1/chat/message', {
        message: trimmed,
        history,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al contactar el asistente'
      setError(msg)
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  const isEmpty = messages.length === 0

  return (
    <PageContainer>
      <TopBar title="Asistente IA" />

      {/* Messages area */}
      <div className="flex-1 scrollable px-4 py-4 space-y-4">
        {isEmpty && (
          <div className="flex flex-col items-center pt-6 pb-2 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-[0_4px_20px_rgba(139,92,246,0.35)]">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <p className="font-bold text-white text-lg font-heading">Asistente HealthStack</p>
            <p className="text-zinc-500 text-sm mt-1 max-w-xs leading-relaxed">
              Pregúntame sobre nutrición, entrenamiento, salud o cualquier otra cosa.
            </p>
          </div>
        )}

        {isEmpty && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Sugerencias</p>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="w-full text-left px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-300 hover:border-zinc-600 hover:text-white transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-teal-500 to-cyan-400 text-white rounded-br-sm'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-sm'
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mr-2 mt-0.5 flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              <span className="text-sm text-zinc-500">Pensando…</span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-center">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md px-4 py-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={loading}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 transition-colors min-h-[44px] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Enviar mensaje"
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white shadow-[0_2px_10px_rgba(8,145,178,0.35)] disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </PageContainer>
  )
}
