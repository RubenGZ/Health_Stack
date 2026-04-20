import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
]

export function LanguageSelector() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

  /* Cierra al hacer click fuera */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const change = (code: string) => {
    i18n.changeLanguage(code)
    localStorage.setItem('hs-lang', code)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">

      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.12]
                   bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25
                   transition-all text-white"
        aria-label="Seleccionar idioma"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wide text-neutral-300">
          {current.label}
        </span>
        <svg
          className={`w-3 h-3 text-neutral-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-44 rounded-xl overflow-hidden z-[200]
                     bg-[#0d0d18] border border-white/[0.1]
                     shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => change(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                ${lang.code === i18n.language
                  ? 'bg-orange-500/[0.08] text-orange-400'
                  : 'text-neutral-300 hover:bg-white/[0.05]'
                }`}
            >
              <span className="text-lg leading-none">{lang.flag}</span>
              <span className="text-[11px] font-bold uppercase tracking-wide">{lang.label}</span>
              {lang.code === i18n.language && (
                <svg className="w-3 h-3 ml-auto text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
