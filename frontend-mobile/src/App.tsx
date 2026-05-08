import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/services/auth'

import { AppShell }          from '@/components/layout/AppShell'
import { LoginScreen }       from '@/screens/auth/LoginScreen'
import { RegisterScreen }    from '@/screens/auth/RegisterScreen'
import { OnboardingScreen }  from '@/screens/auth/OnboardingScreen'
import { TodayScreen }       from '@/screens/today/TodayScreen'
import { TrainScreen }       from '@/screens/train/TrainScreen'
import { NutritionScreen }   from '@/screens/nutrition/NutritionScreen'
import { ProfileScreen }     from '@/screens/profile/ProfileScreen'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
    </div>
  )
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, clearUser, setLoading } = useAuthStore()

  useEffect(() => {
    const token = localStorage.getItem('hs_access_token')
    if (!token) { clearUser(); return }
    setLoading(true)
    getMe()
      .then(setUser)
      .catch(() => clearUser())
  }, [setUser, clearUser, setLoading])

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth — public */}
        <Route path="/auth/login"      element={<LoginScreen />} />
        <Route path="/auth/register"   element={<RegisterScreen />} />

        {/* Onboarding — requires auth */}
        <Route path="/auth/onboarding" element={<AuthGuard><OnboardingScreen /></AuthGuard>} />

        {/* App — requires auth */}
        <Route path="/app" element={<AuthGuard><AppShell /></AuthGuard>}>
          <Route index element={<Navigate to="/app/today" replace />} />
          <Route path="today"     element={<TodayScreen />} />
          <Route path="train"     element={<TrainScreen />} />
          <Route path="nutrition" element={<NutritionScreen />} />
          <Route path="profile"   element={<ProfileScreen />} />
        </Route>

        {/* Root redirect */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
