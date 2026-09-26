import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onSessionExpired, tokenStore } from '../services/api'
import { authApi } from '../services/endpoints'
import type { User } from '../types/api'

interface AuthState {
  user: User | null
  /** True until a stored token has been checked against /auth/me. */
  restoring: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [restoring, setRestoring] = useState(() => tokenStore.get() !== null)

  // Resume a session from a stored token.
  useEffect(() => {
    if (!tokenStore.get()) return
    authApi
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setRestoring(false))
  }, [])

  // Any 401 from the API (expired token, deactivated account) signs the user out.
  useEffect(() => onSessionExpired(() => setUser(null)), [])

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    if (!response.Token || !response.Data) throw new Error(response.Message)
    tokenStore.set(response.Token)
    setUser(response.Data)
    return response.Data
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, restoring, login, logout }), [user, restoring, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
