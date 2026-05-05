'use client'

import { Suspense, lazy } from 'react'
import { HeroOrbs } from './hero-orbs'

const Spline = lazy(() => import('@splinetool/react-spline'))

interface SplineSceneProps {
  scene: string
  className?: string
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense fallback={<HeroOrbs className={className} />}>
      <Spline scene={scene} className={className} />
    </Suspense>
  )
}
