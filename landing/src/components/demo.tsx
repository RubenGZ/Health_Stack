import { useRef, useCallback, type ReactNode } from 'react'
import { useTranslation }        from 'react-i18next'
import { useGeoPrice }           from '@/hooks/useGeoPrice'
import { SplineScene }            from '@/components/ui/splite'
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
  Star, Check, X, ChevronRight, Menu,
} from 'lucide-react'

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

// ok flags: which plan features are included (true) vs crossed-out (false)
const PLAN_OK: boolean[][] = [
  [true, true, true, true, true,  true ],
  [true, true, true, true, true,  true ],
  [true, true, true, true, true,  true ],
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
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)', willChange: 'transform' }}
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

  /* Translated arrays */
  type FeatureI18n     = { title: string; desc: string }
  type TestimonialI18n = { name: string; role: string; quote: string }
  type PlanI18n        = { tier: string; period: string; desc: string; cta: string; features: string[] }

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
          <Button variant="outline" className="hidden md:flex px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-xl border-white/[0.14] text-white hover:bg-white/[0.07] hover:border-white/30 transition-all">
            {t('nav.login')}
          </Button>
          <Button className="px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white border-0 shadow-[0_4px_20px_rgba(8,145,178,0.35)] hover:shadow-[0_6px_28px_rgba(8,145,178,0.5)] hover:-translate-y-0.5 transition-all">
            {t('nav.cta')}
          </Button>
          <button className="md:hidden text-neutral-400 hover:text-white transition-colors ml-1">
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

            <div className="flex flex-wrap gap-3 mb-10">
              <Button className="px-8 py-6 text-[0.82rem] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-[0_8px_32px_rgba(8,145,178,0.38)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.55)] transition-all duration-200 hover:-translate-y-0.5 border-0">
                <Zap className="w-4 h-4 mr-2" />
                {t('hero.cta_primary')}
              </Button>
              <Button variant="outline" className="px-8 py-6 text-[0.82rem] font-bold uppercase tracking-wider rounded-xl border-white/[0.14] text-white hover:bg-white/[0.06] hover:border-white/30 transition-all duration-200 hover:-translate-y-0.5">
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
            <SplineScene scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="w-full h-full" />
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

      {/* ── APP PREVIEW (ContainerScroll) ───────────────────── */}
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

      {/* ── SHADER INTERLUDE ────────────────────────────────── */}
      <section className="relative overflow-hidden h-[380px] flex items-center justify-center">
        <ShaderAnimation className="absolute inset-0 w-full h-full opacity-70" />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(5,5,8,0.55) 0%, rgba(5,5,8,0.92) 100%)' }} />
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
                <Button className={`w-full py-6 text-[0.8rem] font-extrabold uppercase tracking-widest rounded-xl transition-all duration-200 hover:-translate-y-0.5 border-0 ${plan.primary ? 'bg-gradient-to-r from-teal-500 to-cyan-400 text-white cta-glow-pulse hover:shadow-[0_10px_36px_rgba(8,145,178,0.5)]' : 'bg-transparent text-white border border-white/10 hover:bg-white/[0.06] hover:border-white/25'}`}>
                  {plan.cta}
                </Button>
              </Card>
            </PricingCard>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────── */}
      <section className="relative py-32 px-8 md:px-16 text-center overflow-hidden border-t border-white/[0.04]">
        <ShaderAnimation className="absolute inset-0 w-full h-full opacity-30" />
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
          <div className="flex gap-4 justify-center flex-wrap">
            <Button className="px-10 py-6 text-[0.82rem] font-extrabold uppercase tracking-widest rounded-xl bg-gradient-to-r from-teal-500 to-cyan-400 text-white shadow-[0_8px_32px_rgba(8,145,178,0.4)] hover:shadow-[0_14px_44px_rgba(8,145,178,0.55)] hover:-translate-y-0.5 transition-all duration-200 border-0">
              <Zap className="w-4 h-4 mr-2" />
              {t('cta.primary')}
            </Button>
            <Button variant="outline" className="px-10 py-6 text-[0.82rem] font-bold uppercase tracking-wider rounded-xl border-white/[0.14] text-white hover:bg-white/[0.06] hover:border-white/30 hover:-translate-y-0.5 transition-all duration-200">
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
