import { Outlet } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'

export function AppShell() {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
