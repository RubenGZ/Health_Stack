import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('h-full flex flex-col overflow-hidden', className)}>
      {children}
    </div>
  )
}

export function ScrollArea({ children, className }: PageContainerProps) {
  return (
    <div
      role="region"
      tabIndex={0}
      aria-label="Contenido desplazable"
      className={cn('flex-1 scrollable px-4 py-4 space-y-4 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none focus:outline-none', className)}
    >
      {children}
    </div>
  )
}
