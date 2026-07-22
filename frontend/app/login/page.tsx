'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      router.push('/chat/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  function fillDemo(u: string, p: string) {
    setUsername(u); setPassword(p); setError('')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">

      {/* Branding */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Legal Intelligence Platform
        </h1>
        <p className="text-slate-500 text-sm mt-1">NSW Law · RAG · Plain English</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Username</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Password</label>
              <input
                type="password"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <Separator />

          {/* Demo accounts */}
          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
              Demo accounts
            </p>
            {[
              { label: 'Sojung Kwon', u: 'sojung', p: 'demo1234', badge: 'User' },
              { label: 'Demo',        u: 'demo',   p: 'demo',     badge: 'User' },
            ].map(({ label, u, p, badge }) => (
              <button
                key={u}
                onClick={() => fillDemo(u, p)}
                className="w-full flex items-center justify-between text-left text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-100 hover:border-slate-300 transition-all"
              >
                <span className="text-slate-700 font-medium">{label}</span>
                <Badge variant="secondary" className="text-xs">{badge}</Badge>
              </button>
            ))}
          </div>

        </CardContent>
      </Card>

      {/* MCP / OAuth link */}
      <p className="mt-6 text-xs text-slate-400">
        Integrating with Claude or a Custom GPT?{' '}
        <a href="/connect/" className="text-slate-600 underline underline-offset-2 hover:text-slate-900">
          Connect via API →
        </a>
      </p>
    </div>
  )
}
