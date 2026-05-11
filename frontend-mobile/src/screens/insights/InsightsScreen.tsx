import { useState, useEffect } from 'react'
import {
  Brain, Activity, Target, Loader2, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, Sparkles,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { api } from '@/services/api'

/* ── Types ──────────────────────────────────────────────────── */
interface NarrativeResponse {
  narrative: string
  generated_at?: string
}

interface InjuryRiskResponse {
  risk_level: 'low' | 'moderate' | 'high' | string
  summary: string
  recommendations: string[]
}

interface WeeklyGoalsResponse {
  goals: string[]
  focus_area: string
  motivational_message: string
}

/* ── InsightCard ────────────────────────────────────────────── */
function InsightCard({
  title,
  icon,
  color,
  loading,
  error,
  children,
  onRefresh,
}: {
  title: string
  icon: React.ReactNode
  color: string
  loading: boolean
  error: string | null
  children: React.ReactNode
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={`bg-zinc-900 border rounded-2xl overflow-hidden ${color}`}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between px-4 py-4 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
        onKeyDown={e => e.key === 'Enter' && setExpanded(x => !x)}
      >
        <div className="flex items-center gap-3">
          <span>{icon}</span>
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <button
              onClick={e => { e.stopPropagation(); onRefresh() }}
              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
              aria-label="Actualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="w-5 h-5 text-cyan-500 animate-spin" />
              <span className="text-sm text-zinc-500">Analizando con IA…</span>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={onRefresh} className="text-xs text-red-400 underline mt-1">
                Reintentar
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  )
}

/* ── Risk badge ─────────────────────────────────────────────── */
function RiskBadge({ level }: { level: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    low:      { label: 'Bajo', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    moderate: { label: 'Moderado', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    high:     { label: 'Alto', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  }
  const { label, cls } = cfg[level] ?? { label: level, cls: 'bg-zinc-700 text-zinc-300 border-zinc-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  )
}

/* ── Main screen ────────────────────────────────────────────── */
export function InsightsScreen() {
  /* Biomarker narrative */
  const [narrative, setNarrative] = useState<NarrativeResponse | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(true)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)

  /* Injury risk */
  const [injury, setInjury] = useState<InjuryRiskResponse | null>(null)
  const [injuryLoading, setInjuryLoading] = useState(true)
  const [injuryError, setInjuryError] = useState<string | null>(null)

  /* Weekly goals */
  const [goals, setGoals] = useState<WeeklyGoalsResponse | null>(null)
  const [goalsLoading, setGoalsLoading] = useState(true)
  const [goalsError, setGoalsError] = useState<string | null>(null)

  async function fetchNarrative() {
    setNarrativeLoading(true)
    setNarrativeError(null)
    try {
      const data = await api.get<NarrativeResponse>('/api/v1/ai_insights/biomarker-narrative')
      setNarrative(data)
    } catch (e) {
      setNarrativeError(e instanceof Error ? e.message : 'Error al cargar análisis')
    } finally {
      setNarrativeLoading(false)
    }
  }

  async function fetchInjury() {
    setInjuryLoading(true)
    setInjuryError(null)
    try {
      const data = await api.get<InjuryRiskResponse>('/api/v1/ai_insights/injury-risk')
      setInjury(data)
    } catch (e) {
      setInjuryError(e instanceof Error ? e.message : 'Error al evaluar riesgo')
    } finally {
      setInjuryLoading(false)
    }
  }

  async function fetchGoals() {
    setGoalsLoading(true)
    setGoalsError(null)
    try {
      const data = await api.get<WeeklyGoalsResponse>('/api/v1/ai_insights/weekly-goals')
      setGoals(data)
    } catch (e) {
      setGoalsError(e instanceof Error ? e.message : 'Error al cargar objetivos')
    } finally {
      setGoalsLoading(false)
    }
  }

  useEffect(() => {
    fetchNarrative()
    fetchInjury()
    fetchGoals()
  }, [])

  return (
    <PageContainer>
      <TopBar back title="AI Insights" />

      <ScrollArea>
        {/* Intro */}
        <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-violet-300">Análisis personalizado por IA</p>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              Los insights se generan con tus datos biométricos. Cuantos más registros tengas, más precisos serán.
            </p>
          </div>
        </div>

        {/* ── Biomarker Narrative ── */}
        <InsightCard
          title="Análisis de biomarcadores"
          icon={<Brain className="w-5 h-5 text-violet-400" />}
          color="border-violet-500/20"
          loading={narrativeLoading}
          error={narrativeError}
          onRefresh={fetchNarrative}
        >
          {narrative && (
            <p className="text-sm text-zinc-300 leading-relaxed">{narrative.narrative}</p>
          )}
        </InsightCard>

        {/* ── Injury Risk ── */}
        <InsightCard
          title="Riesgo de lesión"
          icon={<Activity className="w-5 h-5 text-orange-400" />}
          color="border-orange-500/20"
          loading={injuryLoading}
          error={injuryError}
          onRefresh={fetchInjury}
        >
          {injury && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <RiskBadge level={injury.risk_level} />
                <p className="text-sm text-zinc-300 flex-1">{injury.summary}</p>
              </div>
              {injury.recommendations.length > 0 && (
                <div className="bg-zinc-800/60 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Recomendaciones</p>
                  <ul className="flex flex-col gap-1.5">
                    {injury.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </InsightCard>

        {/* ── Weekly Goals ── */}
        <InsightCard
          title="Objetivos semanales"
          icon={<Target className="w-5 h-5 text-cyan-400" />}
          color="border-cyan-500/20"
          loading={goalsLoading}
          error={goalsError}
          onRefresh={fetchGoals}
        >
          {goals && (
            <div className="flex flex-col gap-4">
              {/* Motivational message */}
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                <p className="text-sm text-cyan-300 italic leading-relaxed">
                  "{goals.motivational_message}"
                </p>
              </div>

              {/* Focus area */}
              {goals.focus_area && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Área de enfoque:</span>
                  <span className="text-xs font-semibold text-white">{goals.focus_area}</span>
                </div>
              )}

              {/* Goals list */}
              {goals.goals.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {goals.goals.map((g, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-zinc-300 leading-snug">{g}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </InsightCard>

        {/* Disclaimer */}
        <p className="text-[10px] text-zinc-600 text-center leading-relaxed px-2">
          Los análisis de IA son orientativos y no sustituyen el consejo médico profesional.
        </p>
      </ScrollArea>
    </PageContainer>
  )
}
