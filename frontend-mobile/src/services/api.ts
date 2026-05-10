// In dev the Vite server runs on a different port than the backend,
// so we keep the explicit localhost:8000 fallback.
// In production the mobile PWA is served by the same nginx host that
// proxies /api/v1/ → backend, so window.location.origin is correct.
const BASE_URL: string =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:8000')

function getToken(): string | null {
  return localStorage.getItem('hs_access_token')
}

function getRefreshToken(): string | null {
  return localStorage.getItem('hs_refresh_token')
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('hs_access_token', access)
  localStorage.setItem('hs_refresh_token', refresh)
}

export function clearTokens() {
  localStorage.removeItem('hs_access_token')
  localStorage.removeItem('hs_refresh_token')
}

let refreshPromise: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json() as { access_token: string; refresh_token: string }
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    return false
  }
}

function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, false)
    clearTokens()
    // Use the Vite BASE_URL so the redirect stays inside the /mobile/ sub-path.
    // import.meta.env.BASE_URL is '/mobile/' in production, '/' in dev.
    window.location.href = import.meta.env.BASE_URL + 'auth/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { detail?: string | Array<{ msg?: string }> }
    let message: string
    if (Array.isArray(data.detail)) {
      message = data.detail.map(e => e.msg ?? String(e)).join('. ')
    } else {
      message = data.detail ?? `HTTP ${res.status}`
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string)                => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(path: string)               => request<T>(path, { method: 'DELETE' }),
}
