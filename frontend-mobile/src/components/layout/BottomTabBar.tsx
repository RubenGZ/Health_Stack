import { NavLink, useLocation } from 'react-router-dom'
import { Home, Dumbbell, Utensils, MessageSquare, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/app/today',     label: 'Hoy',    Icon: Home           },
  { to: '/app/train',     label: 'Gym',    Icon: Dumbbell       },
  { to: '/app/nutrition', label: 'Comida', Icon: Utensils       },
  { to: '/app/chat',      label: 'IA',     Icon: MessageSquare  },
  { to: '/app/profile',   label: 'Perfil', Icon: User           },
]

export function BottomTabBar() {
  const { pathname } = useLocation()

  return (
    <nav
      className="flex-shrink-0 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-16">
        {tabs.map(({ to, label, Icon }) => {
          const active = pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 tap-highlight-none transition-colors min-h-[48px] relative',
                active ? 'text-primary' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {/* Active pill indicator */}
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" aria-hidden />
              )}
              <Icon
                className="w-5 h-5"
                strokeWidth={active ? 2.5 : 1.75}
                fill={active ? 'currentColor' : 'none'}
              />
              <span className={cn('text-[10px] font-semibold leading-none', active && 'text-primary')}>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
