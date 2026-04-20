import { useEffect, useState } from 'react'

interface TypewriterEffectProps {
  words: string[]
  className?: string
  /** ms between each character while typing  */
  typeSpeed?: number
  /** ms between each character while deleting */
  deleteSpeed?: number
  /** ms to pause at full word before deleting  */
  pauseMs?: number
}

export function TypewriterEffect({
  words,
  className,
  typeSpeed = 95,
  deleteSpeed = 48,
  pauseMs = 1800,
}: TypewriterEffectProps) {
  const [wordIdx,  setWordIdx]  = useState(0)
  const [text,     setText]     = useState('')
  const [deleting, setDeleting] = useState(false)
  const [pausing,  setPausing]  = useState(false)

  useEffect(() => {
    if (pausing) return

    const word   = words[wordIdx]
    const speed  = deleting ? deleteSpeed : typeSpeed

    const id = setTimeout(() => {
      if (!deleting) {
        const next = word.substring(0, text.length + 1)
        setText(next)
        if (next === word) {
          setPausing(true)
          setTimeout(() => { setPausing(false); setDeleting(true) }, pauseMs)
        }
      } else {
        const next = word.substring(0, text.length - 1)
        setText(next)
        if (next === '') {
          setDeleting(false)
          setWordIdx(i => (i + 1) % words.length)
        }
      }
    }, speed)

    return () => clearTimeout(id)
  }, [text, deleting, pausing, wordIdx, words, typeSpeed, deleteSpeed, pauseMs])

  return (
    <span className={className}>
      {text}
      <span
        aria-hidden
        className="inline-block w-[3px] bg-orange-400 ml-1 align-middle"
        style={{
          height: '0.9em',
          borderRadius: 2,
          animation: 'tw-blink 0.85s step-end infinite',
        }}
      />
      <style>{`
        @keyframes tw-blink {
          0%,100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>
    </span>
  )
}
