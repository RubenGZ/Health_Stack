import { api, setTokens, clearTokens } from './api'

interface AuthResponse {
  access_token: string
  refresh_token: string
}

interface UserMe {
  id: string
  email: string
  display_name: string | null
  role: string
}

export async function login(email: string, password: string): Promise<UserMe> {
  const data = await api.post<AuthResponse>('/api/v1/auth/login', { email, password })
  setTokens(data.access_token, data.refresh_token)
  return api.get<UserMe>('/api/v1/auth/me')
}

/** Register then immediately log in — returns the authenticated user. */
export async function register(email: string, password: string, display_name: string | null): Promise<UserMe> {
  await api.post('/api/v1/auth/register', {
    email,
    password,
    display_name: display_name || null,
    consent_gdpr: true,
  })
  return login(email, password)
}

export async function getMe(): Promise<UserMe> {
  return api.get<UserMe>('/api/v1/auth/me')
}

export function logout() {
  clearTokens()
}
