import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title: string
  back?: boolean
  right?: ReactNode
  className?: string
}

export function TopBar({ title, back, right, className }: TopBarProps) {
  const navigate = useNavigate()

  return (
    <header
      className={cn(
        'flex-shrink-0 flex items-center justify-between px-4 min-h-14 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800',
        className
      )}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: '0' }}
    >
      <div className="w-10">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>
      <h1 className="text-base font-bold text-white font-heading">{title}</h1>
      <div className="w-10 flex justify-end">{right}</div>
    </header>
  )
}
