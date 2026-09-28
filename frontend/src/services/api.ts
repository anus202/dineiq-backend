import axios, { AxiosError, type AxiosInstance } from 'axios'

const TOKEN_KEY = 'dineiq.token'

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {

    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {

    }
  },
}

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  timeout: 120_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type SessionListener = () => void
const sessionListeners = new Set<SessionListener>()
export const onSessionExpired = (listener: SessionListener): (() => void) => {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isLoginCall = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLoginCall && tokenStore.get()) {
      tokenStore.clear()
      sessionListeners.forEach((listener) => listener())
    }
    return Promise.reject(error)
  },
)

interface ValidationIssue {
  loc: (string | number)[]
  msg: string
}

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Cannot reach the DineIQ API. Is the backend running on port 8000?'
    const data = error.response.data as { detail?: string | ValidationIssue[]; Message?: string } | undefined
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => `${d.loc.slice(1).join('.')}: ${d.msg.replace(/^Value error, /, '')}`).join('; ')
    }
    if (data?.Message) return data.Message
    return `Request failed (${error.response.status})`
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
