'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type User = { username: string; name: string; role: string }

type AuthCtx = {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    localStorage.getItem('__probe__')  // throws if env localStorage is broken
    return localStorage
  }
  catch { return null }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const ls = safeStorage()
    if (!ls) return
    const t = ls.getItem('iai_token')
    const u = ls.getItem('iai_user')
    if (t && u && !isTokenExpired(t)) {
      setToken(t); setUser(JSON.parse(u))
    } else {
      ls.removeItem('iai_token')
      ls.removeItem('iai_user')
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.detail || 'Login failed')
    }
    const data = await r.json()
    safeStorage()?.setItem('iai_token', data.access_token)
    safeStorage()?.setItem('iai_user', JSON.stringify(data.user))
    setToken(data.access_token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    safeStorage()?.removeItem('iai_token')
    safeStorage()?.removeItem('iai_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
