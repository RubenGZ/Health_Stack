// landing/src/components/ui/hero-orbs.tsx
export function HeroOrbs({ className }: { className?: string }) {
  return (
    <div className={`relative w-full h-full min-h-[500px] overflow-hidden ${className ?? ''}`} aria-hidden>
      <div className="hero-orb-1" />
      <div className="hero-orb-2" />
      <div className="hero-orb-3" />
      <div className="hero-grid-overlay" />
    </div>
  )
}
