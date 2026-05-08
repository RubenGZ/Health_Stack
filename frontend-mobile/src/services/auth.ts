import { api, setTokens, clearTokens } from './api'

interface AuthResponse {
  access_token: string
  refresh_token: string
}

interface UserMe {
  user_id: string
  email: string
  display_name: string | null
  role: string
}

export async function login(email: string, password: string): Promise<UserMe> {
  const data = await api.post<AuthResponse>('/api/v1/auth/login', { email, password })
  setTokens(data.access_token, data.refresh_token)
  return api.get<UserMe>('/api/v1/auth/me')
}

export async function register(email: string, password: string, display_name: string): Promise<void> {
  await api.post('/api/v1/auth/register', { email, password, display_name, consent_gdpr: true })
}

export async function getMe(): Promise<UserMe> {
  return api.get<UserMe>('/api/v1/auth/me')
}

export function logout() {
  clearTokens()
}
