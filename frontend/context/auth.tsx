'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { API_URL as API } from '@/lib/config'
type User = {
  username: string
  name: string
  role: string
  email_verified: boolean
}

type AuthCtx = {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<{ email_verified: boolean }>
  loginWithToken: (token: string, refreshToken?: string) => void
  logout: () => Promise<void>
  refreshAuth: () => Promise<boolean>
  resendVerification: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)


function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    localStorage.getItem('__probe__')
    return localStorage
  } catch { return null }
}

function isExpired(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split('.')[1]))
    return p.exp * 1000 < Date.now()
  } catch { return true }
}

function isExpiringSoon(token: string, withinMs = 5 * 60 * 1000): boolean {
  try {
    const p = JSON.parse(atob(token.split('.')[1]))
    return p.exp * 1000 < Date.now() + withinMs
  } catch { return true }
}

function decode(token: string): User {
  const p = JSON.parse(atob(token.split('.')[1]))
  return {
    username:       p.sub,
    name:           p.name,
    role:           p.role,
    email_verified: p.email_verified ?? true,
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  const _store = useCallback((access: string, refresh?: string) => {
    const ls = safeStorage()
    ls?.setItem('iai_token', access)
    if (refresh) ls?.setItem('iai_refresh', refresh)
    setToken(access)
    setUser(decode(access))
  }, [])

  const refreshAuth = useCallback(async (): Promise<boolean> => {
    const ls = safeStorage()
    const r  = ls?.getItem('iai_refresh')
    if (!r) return false
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: r }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      _store(data.access_token, data.refresh_token)
      return true
    } catch {
      ls?.removeItem('iai_token')
      ls?.removeItem('iai_refresh')
      setToken(null)
      setUser(null)
      return false
    }
  }, [_store])

  // On mount: restore session or silently refresh
  useEffect(() => {
    const ls = safeStorage()
    if (!ls) return
    const t = ls.getItem('iai_token')
    const r = ls.getItem('iai_refresh')
    if (t && !isExpired(t)) {
      setToken(t)
      setUser(decode(t))
      // Pre-emptively refresh if expiring in < 5 min
      if (r && isExpiringSoon(t)) refreshAuth()
    } else if (r) {
      refreshAuth()
    } else {
      ls.removeItem('iai_token')
      ls.removeItem('iai_refresh')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Login failed')
    }
    const data = await res.json()
    _store(data.access_token, data.refresh_token)
    safeStorage()?.removeItem('iai_anon_count')
  }, [_store])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${API}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Registration failed')
    }
    const data = await res.json()
    _store(data.access_token, data.refresh_token)
    safeStorage()?.removeItem('iai_anon_count')
    return { email_verified: data.user?.email_verified ?? false }
  }, [_store])

  const loginWithToken = useCallback((access: string, refresh?: string) => {
    _store(access, refresh)
    safeStorage()?.removeItem('iai_anon_count')
  }, [_store])

  const logout = useCallback(async () => {
    const ls = safeStorage()
    const r  = ls?.getItem('iai_refresh')
    if (r) {
      try {
        await fetch(`${API}/auth/logout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh_token: r }),
        })
      } catch {}
    }
    ls?.removeItem('iai_token')
    ls?.removeItem('iai_refresh')
    ls?.removeItem('iai_anon_count')
    setToken(null)
    setUser(null)
  }, [])

  const resendVerification = useCallback(async () => {
    if (!user) return
    await fetch(`${API}/auth/resend-verification`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: user.username }),
    })
  }, [user])

  return (
    <AuthContext.Provider value={{
      user, token, login, register, loginWithToken,
      logout, refreshAuth, resendVerification,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
