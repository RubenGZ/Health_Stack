import { create } from 'zustand'

interface User {
  id: string
  email: string
  display_name: string | null
  role: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User) => void
  clearUser: () => void
  setLoading: (v: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser:    (user) => set({ user, isAuthenticated: true, isLoading: false }),
  clearUser:  ()     => set({ user: null, isAuthenticated: false, isLoading: false }),
  setLoading: (v)    => set({ isLoading: v }),
}))
