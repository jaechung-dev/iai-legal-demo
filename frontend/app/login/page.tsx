'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scale } from 'lucide-react'
import { useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'

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
    <div className="min-h-screen flex">

      {/* Left panel — branding (desktop) */}
      <div className="hidden lg:flex lg:w-[45%] bg-indigo-900 flex-col justify-between p-12">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-base">ProBono AI</span>
        </div>

        <div className="space-y-10">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              Legal help in<br />plain English
            </h2>
            <p className="text-indigo-200 mt-4 leading-relaxed text-sm">
              Search NSW legislation and caselaw, ask legal questions, and explore case timelines — powered by AI, built for people who need answers.
            </p>
          </div>
          <div className="space-y-3">
            {[
              'NSW legislation & caselaw search',
              'Plain English answers with citations',
              'AI-powered case timeline analysis',
              'Connect Claude via MCP',
            ].map(f => (
              <div key={f} className="flex items-center gap-3 text-sm text-indigo-200">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-indigo-400">
          probonoai.com.au · Not legal advice
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900">ProBono AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Username</label>
              <input
                className="w-full border border-slate-300 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                className="w-full border border-slate-300 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 text-sm font-medium"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-slate-400">Demo accounts</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <div className="space-y-2">
            {[
              { label: 'Sojung Kwon', sub: 'Client view', u: 'sojung', p: 'demo1234' },
              { label: 'Demo User',   sub: 'Guest access',  u: 'demo',   p: 'demo'     },
            ].map(({ label, sub, u, p }) => (
              <button
                key={u}
                onClick={() => fillDemo(u, p)}
                className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                </div>
                <span className="text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Autofill →
                </span>
              </button>
            ))}
          </div>

          <p className="text-center text-xs text-slate-400">
            Connecting Claude or a GPT?{' '}
            <a href="/connect/" className="text-indigo-600 hover:underline">Get an API token</a>
          </p>

        </div>
      </div>
    </div>
  )
}
