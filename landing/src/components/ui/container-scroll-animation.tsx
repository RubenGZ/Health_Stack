import { useRef, type ReactNode } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'

interface ContainerScrollProps {
  titleComponent: ReactNode
  children: ReactNode
  className?: string
}

export function ContainerScroll({ titleComponent, children, className }: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })

  const rotate   = useTransform(scrollYProgress, [0, 0.55], [24, 0])
  const scale    = useTransform(scrollYProgress, [0, 0.55], [0.88, 1])
  const opacity  = useTransform(scrollYProgress, [0, 0.18], [0, 1])
  const slideY   = useTransform(scrollYProgress, [0, 0.55], [40, 0])

  const rotateSpring = useSpring(rotate, { stiffness: 36, damping: 16 })
  const scaleSpring  = useSpring(scale,  { stiffness: 36, damping: 16 })

  return (
    <div ref={containerRef} className={`relative py-24 px-6 ${className ?? ''}`}>
      <div className="max-w-5xl mx-auto">

        {/* Title */}
        <motion.div style={{ opacity, y: slideY }} className="text-center mb-14">
          {titleComponent}
        </motion.div>

        {/* 3-D card */}
        <div style={{ perspective: '1400px' }}>
          <motion.div
            style={{ rotateX: rotateSpring, scale: scaleSpring, transformOrigin: 'top center' }}
            className="overflow-hidden rounded-2xl border border-white/[0.08]
                       shadow-[0_40px_100px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.04)]"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
