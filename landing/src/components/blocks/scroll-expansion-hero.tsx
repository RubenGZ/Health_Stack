import { useRef, type ReactNode } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'

interface ScrollExpandMediaProps {
  /** URL of a video or image */
  mediaSrc: string
  mediaType?: 'video' | 'image'
  /** Poster for video / alt for image */
  poster?: string
  /** Overlay text content */
  textContent?: {
    label?:    string
    title?:    ReactNode
    subtitle?: string
  }
  /** Tailwind bg class or inline style bg color */
  bgClass?: string
  className?: string
}

export function ScrollExpandMedia({
  mediaSrc,
  mediaType = 'image',
  poster,
  textContent,
  bgClass = 'bg-[#050508]',
  className,
}: ScrollExpandMediaProps) {
  const ref = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  })

  const scale        = useTransform(scrollYProgress, [0, 1], [0.72, 1])
  const borderRadius = useTransform(scrollYProgress, [0, 1], [36, 0])
  const opacity      = useTransform(scrollYProgress, [0, 0.25], [0, 1])
  const slideY       = useTransform(scrollYProgress, [0, 0.5], [50, 0])

  const scaleSpring = useSpring(scale, { stiffness: 40, damping: 18 })

  const HEADING = { fontFamily: "'Bebas Neue', 'Arial Black', Impact, sans-serif" }

  return (
    <div ref={ref} className={`relative overflow-hidden ${bgClass} ${className ?? ''}`}>

      {/* Text above */}
      {textContent && (
        <motion.div
          style={{ opacity, y: slideY }}
          className="relative z-10 text-center pt-24 pb-12 px-8 max-w-3xl mx-auto"
        >
          {textContent.label && (
            <p className="text-[11px] font-bold uppercase tracking-[3px] text-orange-400 mb-3">
              {textContent.label}
            </p>
          )}
          {textContent.title && (
            <h2
              className="text-5xl md:text-6xl font-black uppercase tracking-widest leading-[0.94] text-white mb-4"
              style={HEADING}
            >
              {textContent.title}
            </h2>
          )}
          {textContent.subtitle && (
            <p className="text-neutral-400 text-sm leading-relaxed max-w-md mx-auto">
              {textContent.subtitle}
            </p>
          )}
        </motion.div>
      )}

      {/* Expanding media */}
      <div className="px-6 pb-0">
        <motion.div
          style={{ scale: scaleSpring, borderRadius }}
          className="overflow-hidden mx-auto max-w-6xl relative"
        >
          {/* Gradient overlay on media for text legibility */}
          <div
            aria-hidden
            className="absolute inset-0 z-10 pointer-events-none"
            style={{
              background:
                'linear-gradient(to bottom, rgba(5,5,8,0.4) 0%, transparent 40%, transparent 60%, rgba(5,5,8,0.55) 100%)',
            }}
          />

          {mediaType === 'video' ? (
            <video
              src={mediaSrc}
              poster={poster}
              autoPlay
              muted
              loop
              playsInline
              className="w-full object-cover max-h-[580px]"
            />
          ) : (
            <img
              src={mediaSrc}
              alt={poster ?? ''}
              className="w-full object-cover max-h-[580px]"
              loading="lazy"
            />
          )}
        </motion.div>
      </div>
    </div>
  )
}
