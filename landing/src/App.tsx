import { useEffect } from 'react'
import { SplineSceneBasic } from '@/components/demo'

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768 && navigator.maxTouchPoints > 0)
}

export default function App() {
  const mobile = typeof window !== 'undefined' && isMobile()

  useEffect(() => {
    if (mobile) window.location.replace('/mobile/')
  }, [mobile])

  if (mobile) return null

  return <SplineSceneBasic />
}
