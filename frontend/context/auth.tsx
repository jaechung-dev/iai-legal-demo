'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type User = { username: string; name: string; role: string }

type AuthCtx = {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithToken: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx | null>(null)

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    localStorage.getItem('__probe__')
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

function decodeToken(token: string): User {
  const payload = JSON.parse(atob(token.split('.')[1]))
  return { username: payload.sub, name: payload.name, role: payload.role }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]   = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const ls = safeStorage()
    if (!ls) return
    const t = ls.getItem('iai_token')
    if (t && !isTokenExpired(t)) {
      setToken(t)
      setUser(decodeToken(t))
    } else {
      ls.removeItem('iai_token')
    }
  }, [])

  const _storeToken = useCallback((t: string) => {
    safeStorage()?.setItem('iai_token', t)
    setToken(t)
    setUser(decodeToken(t))
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
    _storeToken(data.access_token)
  }, [_storeToken])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    if (!r.ok) {
      const err = await r.json()
      throw new Error(err.detail || 'Registration failed')
    }
    const data = await r.json()
    _storeToken(data.access_token)
  }, [_storeToken])

  const loginWithToken = useCallback((t: string) => {
    _storeToken(t)
  }, [_storeToken])

  const logout = useCallback(() => {
    safeStorage()?.removeItem('iai_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, register, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
