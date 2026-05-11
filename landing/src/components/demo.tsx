import { useRef, useCallback, useState, useEffect, type ReactNode, Component, type ErrorInfo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation }        from 'react-i18next'
import { useGeoPrice }           from '@/hooks/useGeoPrice'
import { HeroOrbs }               from '@/components/ui/hero-orbs'

// ── Bridge landing → app ────────────────────────────────────
// La landing vive en /landing/, la app en /. Mismo origen, raíz.
const APP_URL    = typeof window !== 'undefined' ? window.location.origin + '/' : '/'
const GOOGLE_URL = typeof window !== 'undefined'
  ? window.location.origin + '/api/v1/auth/google/redirect'
  : '/api/v1/auth/google/redirect'
const goToApp    = () => { window.location.href = APP_URL }
const goToGoogle = () => { window.location.href = GOOGLE_URL }
// SplineScene cargado dinámicamente — fuera del critical path (4.17MB)
type SplineSceneType = React.ComponentType<{ scene: string; className?: string }>
let _SplineScene: SplineSceneType | null = null
import { Card }                   from '@/components/ui/card'
import { Spotlight }              from '@/components/ui/spotlight'
import { Button }                 from '@/components/ui/button'
import { ShaderAnimation }        from '@/components/ui/shader-animation'
import { ContainerScroll }        from '@/components/ui/container-scroll-animation'
import { TypewriterEffect }       from '@/components/ui/typewriter'
import { ScrollExpandMedia }      from '@/components/blocks/scroll-expansion-hero'
import { LanguageSelector }       from '@/components/ui/language-selector'
import {
  Zap, Dumbbell, Apple, Users, Trophy, Clock,
  Star, Check, X, ChevronRight, Menu, Calculator, Target, Flame,
} from 'lucide-react'

class SplineErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }
  componentDidCatch(_: Error, __: ErrorInfo) { this.setState({ crashed: true }) }
  static getDerivedStateFromError() { return { crashed: true } }
  render() {
    if (this.state.crashed) return <div className="w-full h-full bg-gradient-to-br from-cyan-950/30 to-purple-950/20 rounded-xl" />
    return this.props.children
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

/* ── Static structural meta (no text → no translation needed) ─── */

const HEADING = { fontFamily: "'Lora', Georgia, serif" }

const FEATURE_META = [
  { icon: <Zap   className="w-6 h-6" style={{ color: '#0891b2' }} />, iconCls: 'bg-teal-500/10 border border-teal-500/20', cardHover: 'hover:border-teal-500/25 hover:bg-teal-500/[0.04]' },
  { icon: <Apple className="w-6 h-6 text-sky-400"    />, iconCls: 'bg-sky-500/10 border border-sky-500/20',     cardHover: 'hover:border-sky-500/20 hover:bg-sky-500/[0.03]'     },
  { icon: <Dumbbell className="w-6 h-6 text-green-400" />, iconCls: 'bg-green-500/10 border border-green-500/20', cardHover: 'hover:border-green-500/20 hover:bg-green-500/[0.03]' },
  { icon: <Users className="w-6 h-6 text-purple-400" />, iconCls: 'bg-purple-500/10 border border-purple-500/20', cardHover: 'hover:border-purple-500/20 hover:bg-purple-500/[0.03]' },
  { icon: <Trophy className="w-6 h-6 text-amber-400" />, iconCls: 'bg-amber-500/10 border border-amber-500/20',  cardHover: 'hover:border-amber-500/20 hover:bg-amber-500/[0.03]'  },
  { icon: <Clock  className="w-6 h-6 text-rose-400"  />, iconCls: 'bg-rose-500/10 border border-rose-500/20',   cardHover: 'hover:border-rose-500/20 hover:bg-rose-500/[0.03]'   },
]

const TESTIMONIAL_META = [
  { avatar: 'C', avatarCls: 'from-teal-500 to-cyan-400 text-white'   },
  { avatar: 'A', avatarCls: 'from-sky-400 to-blue-600 text-black'       },
  { avatar: 'D', avatarCls: 'from-purple-500 to-violet-700 text-white'  },
]

// ok flags: which features are included (true) vs locked (false) per plan
// Each plan's feature list describes its own tier — all shown as included.
// The false entries mark features shown as "not included" in the lower tier card.
const PLAN_OK: boolean[][] = [
  [true,  true,  true,  true,  true,  true  ], // Starter: all 6 Starter features ✓
  [true,  true,  true,  true,  true,  true  ], // Pro: all 6 Pro features ✓
  [true,  true,  true,  true,  true,  true  ], // Elite: all 6 Elite features ✓
]
const PLAN_META = [
  { featured: false, primary: false },
  { featured: true,  primary: true  },
  { featured: false, primary: false },
]

function PricingCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = ((e.clientY - r.top)  / r.height - 0.5) * -10
    const y = ((e.clientX - r.left) / r.width  - 0.5) *  10
    ref.current.style.transform =
      `perspective(900px) rotateX(${x}deg) rotateY(${y}deg) translateY(-4px) scale(1.01)`
  }, [reduced])

  const onLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = ''
  }, [])

  return (
    <div
      ref={ref}
      className={className}
      onMouseEnter={() => { if (ref.current && !reduced) ref.current.style.willChange = 'transform' }}
      onMouseMove={onMove}
      onMouseLeave={() => { onLeave(); if (ref.current) ref.current.style.willChange = 'auto' }}
      style={{ transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {children}
    </div>
  )
}

const STAT_VALUES = [
  { v: '50K', s: '+' },
  { v: '1M',  s: '+' },
  { v: '4.9', s: '★' },
]

const BAND_VALUES = ['50K+', '300+', '142', '100%']

/* ── Calculator Hub (TDEE · IMC · Proteína · 1RM) ────────────── */

const ACTIVITY_VALUES = [1.2, 1.375, 1.55, 1.725, 1.9]

/* shared input styles */
const inputCls = "w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/60 transition-colors"
const labelCls = "text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 block"

/* ── Body silhouette icon ───────────────────────────────────── */
function BodySilhouette({ type, active }: { type: number; active: boolean }) {
  // [shoulder_w, waist_w, hip_w] in px — wider middle = more fat
  const widths = [[22,12,17],[24,16,20],[24,21,23],[24,28,25],[24,35,29]]
  const [sh, ws, hp] = widths[type]
  const c = active ? '#22d3ee' : '#374151'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
      <div style={{ width:12, height:12, borderRadius:'50%', background:c }} />
      <div style={{ width:sh, height:6, borderRadius:'3px 3px 0 0', background:c }} />
      <div style={{ width:ws, height:14, background:c }} />
      <div style={{ width:hp, height:6, borderRadius:'0 0 3px 3px', background:c }} />
    </div>
  )
}

/* Pants → waist cm lookup tables */
const PANTS_M_EU: Record<string,number>  = {'36':71,'38':76,'40':81,'42':86,'44':91,'46':96,'48':101,'50':106,'52':111}
const PANTS_M_US  = [28,30,32,34,36,38,40,42,44]
const PANTS_F_EU: Record<string,number>  = {'32':62,'34':66,'36':70,'38':74,'40':78,'42':82,'44':87,'46':92,'48':97}

/* WHtR mid-points per body type (sex-specific) → inferred waist = WHtR × height */
const WHTR_M = [0.36, 0.41, 0.47, 0.54, 0.62]
const WHTR_F = [0.34, 0.38, 0.43, 0.50, 0.58]

/* ── IMC sub-calculator ─────────────────────────────────────── */
function IMCCalc() {
  const { t } = useTranslation()
  const [mode, setMode]               = useState<'classic' | 'modern'>('classic')
  const [weight, setWeight]           = useState(80)
  const [height, setHeight]           = useState(178)
  const [sex, setSex]                 = useState<'m' | 'f'>('m')
  const [inputMethod, setInputMethod] = useState<'visual' | 'pants' | 'tape'>('visual')
  const [bodyType, setBodyType]       = useState(2)
  const [pantsSystem, setPantsSystem] = useState<'eu' | 'us'>('eu')
  const [pantsSize, setPantsSize]     = useState('')
  const [waist, setWaist]             = useState(85)
  const [neck, setNeck]               = useState('')

  /* ── Classic BMI ── */
  const bmi       = weight / Math.pow(height / 100, 2)
  const cats      = t('imc.cats',       { returnObjects: true }) as string[]
  const fitCats   = t('imc.fit_cats',   { returnObjects: true }) as string[]
  const bodyTypes = t('imc.body_types', { returnObjects: true }) as { label: string; desc: string }[]
  const thr       = t('imc.thresholds', { returnObjects: true }) as number[]
  const catIdx    = bmi < thr[0] ? 0 : bmi < thr[1] ? 1 : bmi < thr[2] ? 2 : 3
  const catColors = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444']

  /* ── Effective waist derived from chosen input method ── */
  const effectiveWaist = (() => {
    if (inputMethod === 'tape') return waist
    if (inputMethod === 'pants' && pantsSize) {
      if (sex === 'm')
        return pantsSystem === 'eu'
          ? (PANTS_M_EU[pantsSize] ?? waist)
          : Math.round(Number(pantsSize) * 2.54)
      return PANTS_F_EU[pantsSize] ?? waist
    }
    /* visual: WHtR × height */
    return Math.round((sex === 'm' ? WHTR_M : WHTR_F)[bodyType] * height)
  })()

  /* ── RFM (Woolcott & Bergman 2018) / Navy if neck given in tape mode ── */
  const neckNum = parseFloat(neck)
  const useNavy = inputMethod === 'tape' && neck && !isNaN(neckNum) && neckNum > 0
  let rfm: number
  if (useNavy) {
    rfm = sex === 'm'
      ? 495 / (1.0324 - 0.19077 * Math.log10(effectiveWaist - neckNum) + 0.15456 * Math.log10(height)) - 450
      : 495 / (1.29579 - 0.35004 * Math.log10(effectiveWaist + Math.round(effectiveWaist * 1.13) - neckNum) + 0.22100 * Math.log10(height)) - 450
  } else {
    rfm = sex === 'm'
      ? 64 - (20 * (height / effectiveWaist))
      : 76 - (20 * (height / effectiveWaist))
  }
  rfm = Math.max(3, Math.round(rfm * 10) / 10)

  const fitThresholds = sex === 'm' ? [6, 14, 18, 25] : [14, 21, 26, 32]
  const fitCatIdx = rfm < fitThresholds[0] ? 0 : rfm < fitThresholds[1] ? 1 : rfm < fitThresholds[2] ? 2 : rfm < fitThresholds[3] ? 3 : 4
  const fitColors = ['#818cf8', '#22c55e', '#38bdf8', '#f59e0b', '#ef4444']
  const muscleFlag = catIdx >= 2 && fitCatIdx <= 2

  /* ── Pants size lists ── */
  const pantsOptions = sex === 'm'
    ? (pantsSystem === 'eu' ? Object.keys(PANTS_M_EU) : PANTS_M_US.map(String))
    : Object.keys(PANTS_F_EU)

  /* ── Shared results block ── */
  const ModernResults = (
    <>
      {muscleFlag && (
        <div className="bg-purple-500/[0.08] border border-purple-500/30 rounded-2xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-purple-400 mb-1">{t('imc.muscle_flag_title')}</p>
          <p className="text-[11px] text-neutral-400 leading-relaxed">{t('imc.muscle_flag_body')}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-5 opacity-60">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{t('imc.classic_label')}</div>
          <div className="text-3xl font-black text-neutral-400 mb-0.5" style={HEADING}>{bmi.toFixed(1)}</div>
          <div className="text-[10px] font-bold" style={{ color: catColors[catIdx] }}>{cats[catIdx]}</div>
        </div>
        <div className="bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border border-teal-500/30 rounded-2xl p-5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-teal-400 mb-1">{t('imc.rfm_label')}</div>
          <div className="text-3xl font-black text-white mb-0.5" style={HEADING}>{rfm.toFixed(1)}%</div>
          <div className="text-[10px] font-bold" style={{ color: fitColors[fitCatIdx] }}>{fitCats[fitCatIdx]}</div>
        </div>
      </div>
      <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-6">
        <div className="space-y-3">
          {fitCats.map((c, i) => (
            <div key={c} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fitColors[i] }} />
              <div className="text-[10px] font-bold uppercase tracking-wider flex-1" style={{ color: fitColors[i] }}>{c}</div>
              <div className="text-[10px] text-neutral-500">
                {(sex === 'm' ? ['<6%','6–13%','14–17%','18–24%','≥25%'] : ['<14%','14–20%','21–25%','26–31%','≥32%'])[i]}
              </div>
              {fitCatIdx === i && <div className="text-[9px] font-black text-white bg-white/10 px-2 py-0.5 rounded-full">{t('imc.you_marker')}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-teal-500/[0.05] border border-teal-500/20 rounded-2xl p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-400 mb-1.5">{t('imc.modern_why_title')}</p>
        <p className="text-[11px] text-neutral-400 leading-relaxed">{t('imc.modern_why_body')}</p>
        {useNavy && <p className="text-[11px] text-cyan-400 mt-2 font-bold">{t('imc.navy_active')}</p>}
      </div>
    </>
  )

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl w-fit">
        {(['classic', 'modern'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-5 py-2 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-all ${
              mode === m ? 'bg-cyan-500/20 border border-cyan-500/60 text-cyan-400' : 'text-neutral-500 hover:text-white'
            }`}>
            {t(`imc.mode_${m}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Inputs ── */}
        <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-8 space-y-5">
          {/* Weight + Height always visible */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('imc.weight_label')}</label>
              <input type="number" value={weight} min={30} max={300}
                onChange={e => setWeight(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('imc.height_label')}</label>
              <input type="number" value={height} min={100} max={250}
                onChange={e => setHeight(Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          {mode === 'modern' && (
            <>
              {/* Sex */}
              <div>
                <label className={labelCls}>{t('imc.sex_label')}</label>
                <div className="flex gap-2">
                  {(['m', 'f'] as const).map(s => (
                    <button key={s} onClick={() => { setSex(s); setPantsSize('') }}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                        sex === s ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400' : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20'
                      }`}>
                      {s === 'm' ? t('imc.male') : t('imc.female')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input method selector */}
              <div>
                <label className={labelCls}>{t('imc.input_method_label')}</label>
                <div className="flex gap-1.5">
                  {(['visual', 'pants', 'tape'] as const).map(m => (
                    <button key={m} onClick={() => setInputMethod(m)}
                      className={`flex-1 py-2.5 px-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all ${
                        inputMethod === m
                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                          : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                      }`}>
                      {t(`imc.method_${m}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Visual body type selector ── */}
              {inputMethod === 'visual' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {bodyTypes.map((bt, i) => (
                      <button key={i} onClick={() => setBodyType(i)}
                        className={`py-3 px-1 rounded-xl border transition-all text-center ${
                          bodyType === i ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'
                        }`}>
                        <BodySilhouette type={i} active={bodyType === i} />
                        <div className={`text-[8px] font-bold uppercase tracking-wider mt-2 leading-tight ${bodyType === i ? 'text-cyan-400' : 'text-neutral-500'}`}>
                          {bt.label}
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-relaxed">{bodyTypes[bodyType].desc}</p>
                </div>
              )}

              {/* ── Pants size selector ── */}
              {inputMethod === 'pants' && (
                <div className="space-y-3">
                  {sex === 'm' && (
                    <div className="flex gap-2">
                      {(['eu', 'us'] as const).map(sys => (
                        <button key={sys} onClick={() => { setPantsSystem(sys); setPantsSize('') }}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider border transition-all ${
                            pantsSystem === sys ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400' : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20'
                          }`}>
                          {sys === 'eu' ? t('imc.pants_eu') : t('imc.pants_us')}
                        </button>
                      ))}
                    </div>
                  )}
                  <label className={labelCls}>{t('imc.pants_size_label')}</label>
                  <div className="flex flex-wrap gap-2">
                    {pantsOptions.map(size => (
                      <button key={size} onClick={() => setPantsSize(size)}
                        className={`px-3.5 py-2 rounded-lg text-xs font-black border transition-all ${
                          pantsSize === size
                            ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                            : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                        }`}>
                        {size}{sex === 'm' && pantsSystem === 'us' ? '"' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tape measure (precision) ── */}
              {inputMethod === 'tape' && (
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>{t('imc.waist_label')}</label>
                    <input type="number" value={waist} min={50} max={200}
                      onChange={e => setWaist(Number(e.target.value))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{t('imc.neck_label')} <span className="normal-case font-normal text-neutral-600">{t('imc.optional')}</span></label>
                    <input type="number" value={neck} min={25} max={60} placeholder="—"
                      onChange={e => setNeck(e.target.value)} className={inputCls} />
                    <p className="text-[10px] text-neutral-600 mt-1.5">{t('imc.neck_hint')}</p>
                  </div>
                </div>
              )}

              {/* Inferred waist feedback (visual + pants modes) */}
              {inputMethod !== 'tape' && effectiveWaist > 50 && (
                <div className="flex items-center justify-between bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5">
                  <span className="text-[10px] text-neutral-500">{t('imc.inferred_waist')}</span>
                  <span className="text-sm font-black text-white">~{effectiveWaist} cm</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Results ── */}
        <div className="space-y-4">
          {mode === 'classic' ? (
            <>
              <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/5 border border-cyan-500/25 rounded-2xl p-8">
                <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{t('imc.result_label')}</div>
                <div className="text-6xl font-black tracking-wide mb-1" style={{ ...HEADING, color: catColors[catIdx] }}>{bmi.toFixed(1)}</div>
                <div className="text-sm font-bold mb-4" style={{ color: catColors[catIdx] }}>{cats[catIdx]}</div>
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (bmi / 40) * 100)}%`, background: catColors[catIdx] }} />
                </div>
                <div className="mt-2 text-[10px] text-neutral-500">{t('imc.healthy')}</div>
              </div>
              <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-1.5">{t('imc.classic_warning_title')}</p>
                <p className="text-[11px] text-neutral-400 leading-relaxed">{t('imc.classic_warning_body')}</p>
                <button onClick={() => setMode('modern')}
                  className="mt-3 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors">
                  {t('imc.try_modern')} →
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {cats.map((c, i) => (
                  <div key={c} className={`rounded-xl p-3 text-center border transition-all ${catIdx === i ? 'border-white/20 bg-white/[0.06]' : 'border-white/[0.06]'}`}>
                    <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: catColors[i] }}>{c}</div>
                  </div>
                ))}
              </div>
            </>
          ) : ModernResults}
        </div>
      </div>
    </div>
  )
}

/* ── Protein sub-calculator ─────────────────────────────────── */
function ProteinCalc() {
  const { t } = useTranslation()
  const [weight, setWeight] = useState(75)
  const [level, setLevel]   = useState(0)

  const multipliers = [[1.4, 1.8], [1.6, 2.0], [1.8, 2.2]]
  const [minM, optM] = multipliers[level]
  const minG  = Math.round(weight * minM)
  const optG  = Math.round(weight * optM)
  const levels = t('protein_calc.levels', { returnObjects: true }) as string[]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-8 space-y-5">
        <div>
          <label className={labelCls}>{t('protein_calc.weight_label')}</label>
          <input type="number" value={weight} min={30} max={300}
            onChange={e => setWeight(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('protein_calc.level_label')}</label>
          <div className="space-y-2">
            {levels.map((l, i) => (
              <button key={i} onClick={() => setLevel(i)}
                className={`w-full text-left py-3 px-4 rounded-xl text-sm font-bold transition-all border ${level === i ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400' : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/5 border border-cyan-500/25 rounded-2xl p-8">
          <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-4">{t('protein_calc.min_label')}</div>
          <div className="text-5xl font-black text-white mb-1" style={HEADING}>{minG}g</div>
          <div className="text-sm text-neutral-400">{t('protein_calc.g_day')} · {minM}g/kg</div>
        </div>
        <div className="bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border border-teal-500/25 rounded-2xl p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-4">{t('protein_calc.opt_label')}</div>
          <div className="text-5xl font-black text-white mb-1" style={HEADING}>{optG}g</div>
          <div className="text-sm text-neutral-400">{t('protein_calc.g_day')} · {optM}g/kg</div>
        </div>
      </div>
    </div>
  )
}

/* ── 1RM sub-calculator ─────────────────────────────────────── */
function ORMCalc() {
  const { t } = useTranslation()
  const [lifted, setLifted] = useState(100)
  const [reps, setReps]     = useState(5)

  const orm = Math.round(lifted * (1 + reps / 30))
  const percentages = [100, 95, 90, 85, 80, 75, 70]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-8 space-y-5">
        <div>
          <label className={labelCls}>{t('orm.weight_label')}</label>
          <input type="number" value={lifted} min={1} max={500}
            onChange={e => setLifted(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('orm.reps_label')}</label>
          <input type="number" value={reps} min={1} max={20}
            onChange={e => setReps(Number(e.target.value))} className={inputCls} />
        </div>
        <div className="text-[10px] text-neutral-600 leading-relaxed">{t('orm.formula')}</div>
      </div>
      <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-8">
        <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-2">{t('orm.result_label')}</div>
        <div className="text-6xl font-black text-white mb-6" style={HEADING}>{orm} kg</div>
        <div className="space-y-2">
          {percentages.map(pct => (
            <div key={pct} className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{pct}%</span>
              <div className="flex-1 mx-3 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-black text-white w-16 text-right" style={HEADING}>{Math.round(orm * pct / 100)} kg</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── TDEE sub-calculator (extracted from old TDEECalculator) ── */
function TDEECalc() {
  const { t } = useTranslation()
  const [weight, setWeight]     = useState(75)
  const [height, setHeight]     = useState(175)
  const [age, setAge]           = useState(28)
  const [sex, setSex]           = useState<'m' | 'f'>('m')
  const [activity, setActivity] = useState(1.55)
  const [goal, setGoal]         = useState<'cut' | 'maintain' | 'bulk'>('maintain')

  const tmb  = sex === 'm'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161
  const tdee  = Math.round(tmb * activity)
  const target = goal === 'cut' ? tdee - 400 : goal === 'bulk' ? tdee + 250 : tdee
  const protein = Math.round(weight * 2)
  const fat     = Math.round((target * 0.25) / 9)
  const carbs   = Math.round((target - protein * 4 - fat * 9) / 4)

  const activityLabels = t('tdee.activity_opts', { returnObjects: true }) as string[]

  const inputCls = "w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/60 transition-colors"
  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1.5 block"

  const goalLabel = goal === 'cut'
    ? t('tdee.goal_cut')
    : goal === 'bulk'
      ? t('tdee.goal_bulk')
      : t('tdee.goal_maintain')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-8 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('tdee.weight_label')}</label>
            <input type="number" value={weight} min={30} max={250}
              onChange={e => setWeight(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('tdee.height_label')}</label>
            <input type="number" value={height} min={100} max={250}
              onChange={e => setHeight(Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('tdee.age_label')}</label>
            <input type="number" value={age} min={14} max={100}
              onChange={e => setAge(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('tdee.sex_label')}</label>
            <div className="flex gap-2">
              {([['m', t('tdee.male')], ['f', t('tdee.female')]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setSex(v)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${sex === v ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400' : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('tdee.activity_label')}</label>
          <select value={activity} onChange={e => setActivity(Number(e.target.value))}
            className={inputCls + " cursor-pointer"}>
            {ACTIVITY_VALUES.map((val, i) => (
              <option key={val} value={val} className="bg-[#0a0a14]">{activityLabels[i]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('tdee.goal_label')}</label>
          <div className="flex gap-2">
            {([
              ['cut',      t('tdee.cut'),      'text-red-400',   'border-red-500/60 bg-red-500/10'],
              ['maintain', t('tdee.maintain'),  'text-cyan-400',  'border-cyan-500/60 bg-cyan-500/10'],
              ['bulk',     t('tdee.bulk'),      'text-green-400', 'border-green-500/60 bg-green-500/10'],
            ] as const).map(([v, l, tc, ac]) => (
              <button key={v} onClick={() => setGoal(v)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border ${goal === v ? `${ac} ${tc}` : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-cyan-500/10 to-teal-500/5 border border-cyan-500/25 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-5 h-5 text-cyan-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{t('tdee.your_tdee')}</span>
          </div>
          <div className="text-6xl font-black text-white tracking-wide mb-1" style={HEADING}>{tdee.toLocaleString()}</div>
          <div className="text-sm text-neutral-400">{t('tdee.cal_day')}</div>
        </div>
        <div className="bg-gradient-to-br from-teal-500/10 to-cyan-500/5 border border-teal-500/25 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-teal-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{goalLabel}</span>
          </div>
          <div className="text-4xl font-black text-white mb-4" style={HEADING}>
            {target.toLocaleString()} <span className="text-lg text-neutral-400 font-normal">kcal/día</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { labelKey: 'tdee.protein', g: protein, color: '#38bdf8', pct: Math.round(protein * 4 / target * 100) },
              { labelKey: 'tdee.carbs',   g: carbs,   color: '#0891b2', pct: Math.round(carbs * 4 / target * 100) },
              { labelKey: 'tdee.fats',    g: fat,     color: '#a855f7', pct: Math.round(fat * 9 / target * 100) },
            ].map(m => (
              <div key={m.labelKey} className="text-center">
                <div className="text-2xl font-black text-white" style={HEADING}>{m.g}g</div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">{t(m.labelKey)}</div>
                <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => { window.location.href = window.location.origin + '/' }}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white font-extrabold uppercase tracking-widest text-sm shadow-[0_8px_32px_rgba(8,145,178,0.35)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.5)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
          <Calculator className="w-4 h-4" />
          {t('tdee.cta')}
        </button>
      </div>
    </div>
  )
}

/* ── Calculator Hub (tabbed wrapper) ─────────────────────────── */
function CalculatorHub() {
  const { t } = useTranslation()
  const [tab, setTab] = useState(0)
  const tabs = t('calc_tabs', { returnObjects: true }) as string[]

  return (
    <section id="calculadora-tdee" className="py-24 px-8 md:px-16 bg-[#080810] border-t border-white/[0.035]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('tdee.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('tdee.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 to-teal-400">{t('tdee.title_2')}</span>
          </h2>
          <p className="text-neutral-400 max-w-lg text-sm leading-relaxed">{t('tdee.subtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-widest transition-all border ${
                tab === i
                  ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400'
                  : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && <TDEECalc />}
        {tab === 1 && <IMCCalc />}
        {tab === 2 && <ProteinCalc />}
        {tab === 3 && <ORMCalc />}

        {/* SEO text — only show for TDEE tab */}
        {tab === 0 && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-neutral-500 leading-relaxed">
            <div>
              <h3 className="text-white font-bold mb-2 text-[13px]">{t('tdee.seo1_title')}</h3>
              <p>{t('tdee.seo1_body')}</p>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2 text-[13px]">{t('tdee.seo2_title')}</h3>
              <p>{t('tdee.seo2_body')}</p>
            </div>
            <div>
              <h3 className="text-white font-bold mb-2 text-[13px]">{t('tdee.seo3_title')}</h3>
              <p>{t('tdee.seo3_body')}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ── Competitor Comparison ────────────────────────────────────── */
function AppComparison() {
  const { t } = useTranslation()
  const headers = t('comparison.headers', { returnObjects: true }) as string[]
  const rows    = t('comparison.rows',    { returnObjects: true }) as string[][]

  return (
    <section className="py-24 px-8 md:px-16 bg-[#080810] border-t border-white/[0.035]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-14">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('comparison.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('comparison.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 to-teal-400">
              {t('comparison.title_2')}
            </span>
          </h2>
          <p className="text-neutral-400 max-w-lg text-sm leading-relaxed">{t('comparison.subtitle')}</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/[0.065]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.065]">
                {headers.map((h, i) => (
                  <th key={h}
                    className={`px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest whitespace-nowrap
                      ${i === 0 ? 'text-neutral-500 w-48' : i === 1 ? 'text-cyan-400 bg-cyan-500/[0.04]' : 'text-neutral-500'}`}>
                    {i === 1 && <span className="mr-1">⭐</span>}{h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={`border-b border-white/[0.03] ${ri % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                  {row.map((cell, ci) => (
                    <td key={ci}
                      className={`px-5 py-3.5 ${
                        ci === 0
                          ? 'text-neutral-300 font-bold text-[11px]'
                          : ci === 1
                            ? 'text-white font-bold text-[11px] bg-cyan-500/[0.04]'
                            : 'text-neutral-500 text-[11px]'
                      }`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ── SEO Article Cards ────────────────────────────────────────── */
function SEOArticles() {
  const { t } = useTranslation()
  const articles = t('seo_articles.articles', { returnObjects: true }) as Array<{ kw: string; title: string; body: string }>

  return (
    <section className="py-24 px-8 md:px-16 bg-[#050508] border-t border-white/[0.035]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-14">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('seo_articles.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('seo_articles.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 to-teal-400">
              {t('seo_articles.title_2')}
            </span>
          </h2>
          <p className="text-neutral-400 max-w-lg text-sm leading-relaxed">{t('seo_articles.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map((a, i) => (
            <article key={i}
              className="bg-white/[0.025] border border-white/[0.065] rounded-2xl p-7 hover:border-teal-500/25 hover:bg-teal-500/[0.02] transition-all duration-300 hover:-translate-y-1 cursor-default">
              <span className="text-[9px] font-black uppercase tracking-[3px] text-teal-400 mb-3 block">{a.kw}</span>
              <h3 className="text-[0.95rem] font-bold text-white mb-3 leading-snug">{a.title}</h3>
              <p className="text-[13px] text-neutral-400 leading-relaxed">{a.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button onClick={goToApp}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white font-extrabold uppercase tracking-widest text-sm shadow-[0_8px_32px_rgba(8,145,178,0.35)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.5)] hover:-translate-y-0.5 transition-all">
            <Calculator className="w-4 h-4" />
            {t('tdee.cta')}
          </button>
        </div>
      </div>
    </section>
  )
}

/* ── App Integrations ─────────────────────────────────────────── */

const INTEGRATIONS = [
  { name: 'Apple Health',    icon: '🍎', bg: '#1c1c1e', border: '#3a3a3c', color: '#f2f2f7',  status: 'live'    },
  { name: 'Google Fit',      icon: '❤️', bg: '#0d2137', border: '#1a4a6b', color: '#4285f4',  status: 'live'    },
  { name: 'MyFitnessPal',    icon: '🥦', bg: '#001f0d', border: '#00491c', color: '#00a651',  status: 'live'    },
  { name: 'Strava',          icon: '🚴', bg: '#1a0d00', border: '#7a3500', color: '#fc4c02',  status: 'coming'  },
  { name: 'Garmin Connect',  icon: '⌚', bg: '#000f1a', border: '#003d6b', color: '#009ddc',  status: 'coming'  },
  { name: 'Fitbit',          icon: '💙', bg: '#001a26', border: '#005a80', color: '#00b0b9',  status: 'coming'  },
  { name: 'Samsung Health',  icon: '💜', bg: '#100020', border: '#3d006b', color: '#a259e0',  status: 'coming'  },
  { name: 'Wahoo',           icon: '⚡', bg: '#1a0000', border: '#6b0000', color: '#e00000',  status: 'coming'  },
]

function AppIntegrations() {
  const { t } = useTranslation()

  return (
    <section className="py-24 px-8 md:px-16 bg-[#050508] border-t border-white/[0.035]">
      <div className="max-w-5xl mx-auto">
        <div className="mb-14">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">
            {t('integrations.label')}
          </p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('integrations.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 to-teal-400">
              {t('integrations.title_2')}
            </span>
          </h2>
          <p className="text-neutral-400 max-w-lg text-sm leading-relaxed">{t('integrations.subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {INTEGRATIONS.map(app => (
            <div
              key={app.name}
              className="group relative rounded-2xl p-6 flex flex-col items-center gap-3 transition-all duration-300 hover:-translate-y-1 cursor-default"
              style={{ background: app.bg, border: `1px solid ${app.border}` }}
            >
              {/* Live / Coming-soon badge */}
              <span className={`absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                app.status === 'live'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-white/[0.06] text-neutral-500 border border-white/[0.08]'
              }`}>
                {app.status === 'live' ? t('integrations.live') : t('integrations.coming_soon')}
              </span>

              {/* Icon */}
              <div className="text-4xl leading-none mt-1">{app.icon}</div>

              {/* Name */}
              <span className="text-[11px] font-bold text-center leading-tight" style={{ color: app.color }}>
                {app.name}
              </span>

              {/* Subtle glow on hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ boxShadow: `inset 0 0 30px ${app.color}18` }}
              />
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-neutral-600 uppercase tracking-widest">
          + Garmin, Polar, Suunto, WHOOP · via API abierta
        </p>
      </div>
    </section>
  )
}

/* ── Dashboard Mockup ─────────────────────────────────────────── */

function DashboardMockup() {
  const { t } = useTranslation()
  const exercises = t('dashboard.exercises', { returnObjects: true }) as string[]
  const sets      = t('dashboard.sets',      { returnObjects: true }) as string[]

  const bars = [85.2, 84.8, 84.1, 83.6, 83.2, 82.9, 82.4, 82.1]
  const maxBar = Math.max(...bars)
  const minBar = Math.min(...bars) - 0.5

  const stats = [
    { labelKey: 'dashboard.weight',   value: '82.4 kg', change: t('dashboard.weight_total'), color: 'text-green-400',  border: 'border-green-500/20'  },
    { labelKey: 'dashboard.calories', value: '2,340 kcal', change: '+120',                  color: 'text-cyan-400', border: 'border-cyan-500/20' },
    { labelKey: 'dashboard.xp',       value: '4,820',   change: '+240',                      color: 'text-purple-400', border: 'border-purple-500/20' },
    { labelKey: 'dashboard.level',    value: t('dashboard.level_value'), change: '82%',       color: 'text-amber-400',  border: 'border-amber-500/20'  },
  ]

  const macros = [
    { labelKey: 'dashboard.protein', g: '178g', pct: 78, color: '#38bdf8' },
    { labelKey: 'dashboard.carbs',   g: '210g', pct: 55, color: '#0891b2' },
    { labelKey: 'dashboard.fats',    g: '64g',  pct: 82, color: '#a855f7' },
  ]

  return (
    <div className="bg-[#0a0a14] select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <span className="text-white font-black uppercase tracking-widest text-sm" style={HEADING}>
          HEALTHSTACK <span className="text-cyan-400">PRO</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">
            🔥 {t('dashboard.streak')} 12d
          </span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 flex items-center justify-center text-white text-xs font-black">R</div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-12 gap-4">
        {/* Stat cards */}
        {stats.map(s => (
          <div key={s.labelKey} className={`col-span-3 bg-white/[0.035] border ${s.border} rounded-xl p-4`}>
            <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1.5">{t(s.labelKey)}</p>
            <p className="text-lg font-black text-white leading-none mb-1.5" style={HEADING}>{s.value}</p>
            <p className={`text-[10px] font-bold ${s.color}`}>{s.change}</p>
          </div>
        ))}

        {/* Weight chart */}
        <div className="col-span-8 bg-white/[0.035] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] text-neutral-500 uppercase tracking-widest">{t('dashboard.chart_title')}</p>
            <span className="text-[9px] text-green-400 font-bold bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
              {t('dashboard.weight_total')}
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-28">
            {bars.map((v, i) => {
              const pct = ((v - minBar) / (maxBar - minBar)) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 justify-end">
                  <div className="w-full rounded-sm" style={{
                    height: `${pct}%`,
                    background: i === bars.length - 1
                      ? 'linear-gradient(to top, #0891b2, #22d3ee)'
                      : 'rgba(8,145,178,0.22)',
                  }} />
                  <span className="text-[8px] text-neutral-600">S{i + 1}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Macros */}
        <div className="col-span-4 bg-white/[0.035] border border-white/[0.06] rounded-xl p-4">
          <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-4">{t('dashboard.macros_title')}</p>
          <div className="flex flex-col gap-3">
            {macros.map(m => (
              <div key={m.labelKey}>
                <div className="flex justify-between text-[9px] mb-1">
                  <span className="text-neutral-400">{t(m.labelKey)}</span>
                  <span className="text-white font-semibold">{m.g}</span>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's workout */}
        <div className="col-span-6 bg-white/[0.035] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] text-neutral-500 uppercase tracking-widest">{t('dashboard.workout_title')}</p>
            <span className="text-[8px] text-cyan-400 font-bold">PUSH A</span>
          </div>
          <div className="flex flex-col gap-2">
            {exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 border ${i < 2 ? 'bg-green-500 border-green-500' : 'border-white/20'}`} />
                <span className={`text-[10px] flex-1 ${i < 2 ? 'text-neutral-500 line-through' : 'text-neutral-300'}`}>{ex}</span>
                <span className="text-[9px] text-neutral-600 font-mono">{sets[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Level */}
        <div className="col-span-6 bg-white/[0.035] border border-white/[0.06] rounded-xl p-4">
          <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-3">{t('dashboard.level_title')}</p>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center text-white text-lg font-black" style={HEADING}>17</div>
            <div>
              <p className="text-sm font-bold text-white">{t('dashboard.level_value')}</p>
              <p className="text-[10px] text-neutral-500">4,820 / 5,800 XP</p>
            </div>
          </div>
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-400" style={{ width: '82%' }} />
          </div>
          <p className="text-[9px] text-neutral-600 mt-1.5">980 {t('dashboard.level_next')}</p>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────── */

export function SplineSceneBasic() {
  const { t } = useTranslation()
  const [SplineComp, setSplineComp] = useState<SplineSceneType | null>(null)

  useEffect(() => {
    // Defer Spline load — fuera del critical path para mejorar LCP
    const load = () => {
      if (_SplineScene) { setSplineComp(() => _SplineScene); return }
      import('@/components/ui/splite').then(mod => {
        _SplineScene = mod.SplineScene as SplineSceneType
        setSplineComp(() => _SplineScene)
      })
    }
    if ('requestIdleCallback' in window) {
      requestIdleCallback(load, { timeout: 2000 })
    } else {
      setTimeout(load, 500)
    }
  }, [])

  /* Translated arrays */
  type FeatureI18n     = { title: string; desc: string }
  type TestimonialI18n = { name: string; role: string; quote: string }
  type PlanI18n        = { tier: string; period: string; desc: string; cta: string; features: string[] }

  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()

  const featureI18n     = t('features.items', { returnObjects: true }) as FeatureI18n[]
  const testimonialI18n = t('testimonials.items', { returnObjects: true }) as TestimonialI18n[]
  const planI18n        = t('pricing.plans', { returnObjects: true }) as PlanI18n[]
  const navLinks        = t('nav.links', { returnObjects: true }) as string[]
  const bandLabels      = t('band', { returnObjects: true }) as string[]
  const heroStats       = t('hero.stats', { returnObjects: true }) as string[]
  const typewriterWords = t('hero.typewriter', { returnObjects: true }) as string[]
  const footerLinks     = t('footer.links', { returnObjects: true }) as string[]

  const features     = FEATURE_META.map((m, i) => ({ ...m, ...featureI18n[i] }))
  const testimonials = TESTIMONIAL_META.map((m, i) => ({ ...m, ...testimonialI18n[i] }))
  const geo    = useGeoPrice()
  const geoPrices = [geo.prices.free, geo.prices.pro, geo.prices.elite]
  const plans        = PLAN_META.map((m, i) => ({ ...m, ...planI18n[i], okFlags: PLAN_OK[i], price: geoPrices[i], symbol: geo.symbol }))

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">

      {/* ── MOBILE NAV DRAWER ────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-[60] md:hidden"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-[#080810] border-l border-white/[0.07] z-[70] flex flex-col p-6 md:hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-base font-black uppercase tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-teal-300" style={HEADING}>
                  HEALTHSTACK PRO
                </span>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="p-2 text-neutral-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Cerrar menú"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1 flex-1">
                {navLinks.map(l => (
                  <a
                    key={l}
                    href="#"
                    onClick={() => setMenuOpen(false)}
                    className="text-sm font-bold uppercase tracking-widest text-neutral-300 hover:text-white transition-colors py-3 border-b border-white/[0.05]"
                  >
                    {l}
                  </a>
                ))}
              </nav>
              <div className="flex flex-col gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => { goToGoogle(); setMenuOpen(false) }}
                  className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border-white/[0.14] text-white hover:bg-white/[0.06]"
                >
                  {t('nav.login')}
                </Button>
                <Button
                  onClick={() => { goToApp(); setMenuOpen(false) }}
                  className="w-full py-3 text-sm font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white border-0 shadow-[0_4px_20px_rgba(8,145,178,0.35)]"
                >
                  {t('nav.cta')}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-4
                      bg-[#050508]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <span className="text-xl font-black uppercase tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-teal-300" style={HEADING}>
          HEALTHSTACK PRO
        </span>
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(l => (
            <a key={l} href="#" className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          {/* Iniciar sesión con Google */}
          <Button
            variant="outline"
            onClick={goToGoogle}
            className="hidden md:flex items-center gap-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-xl border-white/[0.14] text-white hover:bg-white/[0.07] hover:border-white/30 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('nav.login')}
          </Button>
          {/* CTA → app */}
          <Button
            onClick={goToApp}
            className="px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white border-0 shadow-[0_4px_20px_rgba(8,145,178,0.35)] hover:shadow-[0_6px_28px_rgba(8,145,178,0.5)] hover:-translate-y-0.5 transition-all"
          >
            {t('nav.cta')}
          </Button>
          <button
            className="md:hidden text-neutral-400 hover:text-white transition-colors ml-1 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <Card className="w-full min-h-screen bg-black/[0.96] relative overflow-hidden rounded-none border-0 pt-20">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.013) 1px,transparent 1px),' +
            'linear-gradient(90deg,rgba(255,255,255,0.013) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }} />

        <div className="flex h-full min-h-[calc(100vh-80px)]">
          {/* Left */}
          <div className="flex-1 p-8 md:p-14 lg:p-20 relative z-10 flex flex-col justify-center max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[11px] font-bold uppercase tracking-[2px] mb-8 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
              {t('hero.badge')}
            </div>

            <h1 className="text-[clamp(3rem,8vw,5.8rem)] font-black leading-[0.92] tracking-widest mb-6 uppercase" style={HEADING}>
              {t('hero.line1')}<br />
              <TypewriterEffect
                words={typewriterWords}
                className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-600"
                typeSpeed={90} deleteSpeed={45} pauseMs={2000}
              /><br />
              {t('hero.line3')}
            </h1>

            <p className="mt-2 mb-8 text-neutral-400 max-w-md text-[1.02rem] leading-[1.75]">
              {t('hero.body')}
            </p>

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-10">
              <Button
                onClick={goToApp}
                className="w-full sm:w-auto px-8 py-6 text-[0.82rem] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-[0_8px_32px_rgba(8,145,178,0.38)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.55)] transition-all duration-200 hover:-translate-y-0.5 border-0"
              >
                <Zap className="w-4 h-4 mr-2" />
                {t('hero.cta_primary')}
              </Button>
              <Button
                variant="outline"
                onClick={goToGoogle}
                className="w-full sm:w-auto px-8 py-6 text-[0.82rem] font-bold uppercase tracking-wider rounded-xl border-white/[0.14] text-white hover:bg-white/[0.06] hover:border-white/30 transition-all duration-200 hover:-translate-y-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mr-2 flex-shrink-0">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t('hero.cta_secondary')}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <div className="flex items-center flex-wrap gap-0 border-t border-white/[0.06] pt-8">
              {STAT_VALUES.map((stat, i) => (
                <div key={i} className={`flex flex-col gap-0.5 px-5 ${i > 0 ? 'border-l border-white/[0.07]' : 'pl-0'}`}>
                  <span className="text-[2rem] font-black tracking-wide text-white leading-none" style={HEADING}>
                    {stat.v}<span className="text-cyan-400">{stat.s}</span>
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    {heroStats[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Spline */}
          <div className="flex-1 relative hidden md:block min-h-[500px]">
            <div aria-hidden className="absolute inset-0 pointer-events-none z-0" style={{
              background: 'radial-gradient(ellipse 58% 68% at 60% 52%, rgba(8,145,178,0.14) 0%, transparent 65%)',
            }} />
            <div className="absolute top-[16%] left-[-4%] z-20 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ animation: 'hsp-float 4s ease-in-out infinite' }}>
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
                <Dumbbell className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-white leading-tight">{t('hero.tag1_title')}</p>
                <p className="text-[10px] text-neutral-500">{t('hero.tag1_sub')}</p>
              </div>
            </div>
            <div className="absolute bottom-[16%] right-[-4%] z-20 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2.5" style={{ animation: 'hsp-float 4s ease-in-out 2s infinite' }}>
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-white leading-tight">{t('hero.tag2_title')}</p>
                <p className="text-[10px] text-neutral-500">{t('hero.tag2_sub')}</p>
              </div>
            </div>
            <SplineErrorBoundary>
              {SplineComp
                ? <SplineComp scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="w-full h-full" />
                : <div className="w-full h-full bg-gradient-to-br from-cyan-950/30 via-purple-950/20 to-transparent rounded-xl" />
              }
            </SplineErrorBoundary>
          </div>
        </div>
      </Card>

      <style>{`
        @keyframes hsp-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-8px); }
        }
      `}</style>

      {/* ── SOCIAL PROOF BAND ───────────────────────────────── */}
      <div className="py-10 px-8 md:px-16 bg-teal-500/[0.04] border-y border-teal-500/[0.1] flex items-center justify-center gap-8 md:gap-16 flex-wrap">
        {BAND_VALUES.map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-3xl md:text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-teal-300 leading-none" style={HEADING}>{v}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{bandLabels[i]}</span>
          </div>
        ))}
      </div>

      {/* ── SCROLL-EXPAND MEDIA ─────────────────────────────── */}
      <ScrollExpandMedia
        mediaSrc="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1920&q=80"
        mediaType="image"
        bgClass="bg-[#080810]"
        textContent={{
          label:    t('expansion.label'),
          title:    <>{t('expansion.title_1')}<br />{t('expansion.title_2')}</>,
          subtitle: t('expansion.subtitle'),
        }}
      />

      {/* ── FEATURES ────────────────────────────────────────── */}
      <section className="py-24 px-8 md:px-16 bg-[#080810]">
        <div className="mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('features.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('features.title_1')}<br />{t('features.title_2')}
          </h2>
          <p className="text-neutral-400 max-w-md text-sm leading-relaxed">{t('features.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <Card key={f.title} className={`group bg-white/[0.025] border-white/[0.065] rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1.5 cursor-default relative overflow-hidden ${f.cardHover}`}>
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-500 to-sky-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${f.iconCls}`}>{f.icon}</div>
              <h3 className="text-[0.97rem] font-bold text-white mb-2.5 tracking-tight">{f.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── CALCULATOR HUB (TDEE · IMC · Proteína · 1RM) ───── */}
      <CalculatorHub />

      {/* ── COMPETITOR COMPARISON ───────────────────────────── */}
      <AppComparison />

      {/* ── SEO ARTICLE CARDS ───────────────────────────────── */}
      <SEOArticles />

      {/* ── APP INTEGRATIONS ────────────────────────────────── */}
      <AppIntegrations />

      {/* ── APP PREVIEW ─────────────────────────────────────── */}
      {isMobile ? (
        <section className="py-16 px-6 bg-[#050508]">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-4">{t('preview.label')}</p>
            <h2 className="text-4xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
              {t('preview.title_1')}<br />{t('preview.title_2')}
            </h2>
            <p className="text-neutral-400 text-sm leading-relaxed">{t('preview.subtitle')}</p>
          </div>
          <div className="rounded-2xl overflow-hidden border border-white/[0.08]">
            <DashboardMockup />
          </div>
        </section>
      ) : (
        <ContainerScroll
          className="bg-[#050508]"
          titleComponent={
            <>
              <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-4">{t('preview.label')}</p>
              <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
                {t('preview.title_1')}<br />{t('preview.title_2')}
              </h2>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-md mx-auto">{t('preview.subtitle')}</p>
            </>
          }
        >
          <DashboardMockup />
        </ContainerScroll>
      )}

      {/* ── SHADER INTERLUDE ────────────────────────────────── */}
      <section className="relative overflow-hidden h-[380px] flex items-center justify-center">
        {!isMobile && <ShaderAnimation className="absolute inset-0 w-full h-full opacity-70" />}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{
          background: isMobile
            ? 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(8,145,178,0.12) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(5,5,8,0.55) 0%, rgba(5,5,8,0.92) 100%)',
        }} />
        <div className="relative z-10 text-center px-6">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-4">{t('shader.label')}</p>
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-widest leading-[0.92] text-white mb-5" style={HEADING}>
            {t('shader.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500" style={{ filter: 'drop-shadow(0 0 20px rgba(8,145,178,0.5))' }}>
              {t('shader.title_2')}
            </span>
          </h2>
          <p className="text-neutral-300 text-sm leading-relaxed max-w-lg mx-auto">{t('shader.subtitle')}</p>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────── */}
      <section className="py-24 px-8 md:px-16 bg-[#050508]">
        <div className="mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('testimonials.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('testimonials.title_1')}<br />{t('testimonials.title_2')}
          </h2>
          <p className="text-neutral-400 max-w-md text-sm">{t('testimonials.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map(t2 => (
            <Card key={t2.name} className="bg-white/[0.025] border-white/[0.065] rounded-2xl p-8 hover:border-sky-500/20 hover:bg-sky-500/[0.02] transition-all duration-300 hover:-translate-y-0.5 flex flex-col gap-5">
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-sm text-neutral-400 leading-[1.75] flex-1 italic">&ldquo;{t2.quote}&rdquo;</p>
              <div className="flex items-center gap-3 border-t border-white/[0.06] pt-5">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t2.avatarCls} flex items-center justify-center text-sm font-bold border-2 border-white/10 flex-shrink-0`}>
                  {t2.avatar}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{t2.name}</p>
                  <p className="text-xs text-neutral-500">{t2.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      <section className="py-24 px-8 md:px-16 bg-[#080810] border-t border-white/[0.035]">
        <div className="mb-16 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-3">{t('pricing.label')}</p>
          <h2 className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4" style={HEADING}>
            {t('pricing.title_1')}<br />{t('pricing.title_2')}
          </h2>
          <p className="text-neutral-400 max-w-lg mx-auto text-sm leading-relaxed">{t('pricing.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {plans.map(plan => (
            <PricingCard key={plan.tier}>
              <Card className={`h-full rounded-2xl p-9 flex flex-col relative transition-colors duration-300 ${plan.featured ? 'bg-teal-500/[0.05] border-teal-500/40 shadow-[0_0_60px_rgba(8,145,178,0.12)]' : 'bg-white/[0.025] border-white/[0.065]'}`}>
                {plan.featured && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-[10px] font-extrabold uppercase tracking-widest rounded-b-lg whitespace-nowrap">
                    {t('pricing.popular')}
                  </div>
                )}
                <p className={`text-[10px] font-bold uppercase tracking-[2.5px] mb-4 ${plan.featured ? 'text-teal-400' : 'text-neutral-500'}`}>{plan.tier}</p>
                <div className="flex items-start gap-0.5 mb-2 leading-none">
                  <span className="text-lg font-semibold text-neutral-400 pt-2">{plan.symbol}</span>
                  <span className="text-[4rem] font-black text-white tracking-wide" style={HEADING}>{plan.price}</span>
                  <span className="text-sm text-neutral-500 self-end pb-2">{plan.period}</span>
                </div>
                <p className="text-sm text-neutral-400 mb-7 pb-6 border-b border-white/[0.055] leading-relaxed">{plan.desc}</p>
                <ul className="flex flex-col gap-3 mb-8 flex-1">
                  {plan.features.map((feat, fi) => (
                    <li key={fi} className={`flex items-center gap-2.5 text-sm ${plan.okFlags[fi] ? 'text-neutral-300' : 'text-neutral-600 line-through'}`}>
                      {plan.okFlags[fi]
                        ? <Check className={`w-4 h-4 flex-shrink-0 ${plan.featured ? 'text-cyan-400' : 'text-green-400'}`} />
                        : <X className="w-4 h-4 flex-shrink-0 text-neutral-600" />}
                      {feat}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={plan.primary ? goToApp : goToGoogle}
                  className={`w-full py-6 text-[0.8rem] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200 hover:-translate-y-0.5 border-0 ${plan.primary ? 'bg-gradient-to-r from-teal-500 to-cyan-400 text-white cta-glow-pulse hover:shadow-[0_10px_36px_rgba(8,145,178,0.5)]' : 'bg-transparent text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/25'}`}>
                  {plan.cta}
                </Button>
              </Card>
            </PricingCard>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <section className="relative py-32 px-8 md:px-16 text-center overflow-hidden border-t border-white/[0.04]">
        {!isMobile && <ShaderAnimation className="absolute inset-0 w-full h-full opacity-30" />}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 65% 70% at 50% 50%, rgba(5,5,8,0.3) 0%, rgba(5,5,8,0.88) 100%)' }} />
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[3px] text-teal-400 mb-5">{t('cta.label')}</p>
          <h2 className="text-5xl md:text-7xl font-black uppercase tracking-widest leading-[0.92] text-white mb-4" style={HEADING}>
            {t('cta.title_1')}<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-300" style={{ filter: 'drop-shadow(0 0 24px rgba(8,145,178,0.4))' }}>
              {t('cta.title_2')}
            </span>
          </h2>
          <p className="text-neutral-400 max-w-md mx-auto mb-10 text-sm leading-relaxed">{t('cta.subtitle')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
            <Button onClick={goToApp} className="w-full sm:w-auto px-10 py-6 text-[0.82rem] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-[0_8px_32px_rgba(8,145,178,0.4)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.55)] hover:-translate-y-0.5 transition-all duration-200 border-0">
              <Zap className="w-4 h-4 mr-2" />
              {t('cta.primary')}
            </Button>
            <Button onClick={goToGoogle} variant="outline" className="w-full sm:w-auto px-10 py-6 text-[0.82rem] font-bold uppercase tracking-wider rounded-xl border-white/[0.14] text-white hover:bg-white/[0.06] hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200">
              <Users className="w-4 h-4 mr-2" />
              {t('cta.secondary')}
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="py-8 px-8 md:px-16 bg-[#080810] border-t border-white/[0.05]">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6 pb-6 border-b border-white/[0.04]">
          <span className="text-xl font-bold italic bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-teal-300" style={HEADING}>
            HEALTHSTACK PRO
          </span>
          <nav className="flex gap-6 flex-wrap">
            {footerLinks.map(l => (
              <a key={l} href="#" className="text-xs text-neutral-500 hover:text-teal-400 transition-colors">{l}</a>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-neutral-600">{t('footer.copyright')}</span>
          <span className="text-xs text-neutral-600">{t('footer.tagline')}</span>
        </div>
      </footer>

    </div>
  )
}
