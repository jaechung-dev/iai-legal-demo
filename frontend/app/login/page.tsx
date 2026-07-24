'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Scale, ArrowRight, Check } from 'lucide-react'
import { useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

const FEATURES = [
  'NSW legislation & caselaw search',
  'Plain English answers with citations',
  'AI-powered case timeline analysis',
  'Connect Claude via MCP',
]

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
    <div className="min-h-screen flex bg-white">

      {/* Left panel — branding (desktop) */}
      <div className="hidden lg:flex lg:w-[45%] bg-zinc-950 flex-col justify-between p-12 relative overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(52,211,153,0.08)_0%,_transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white text-base tracking-tight">ProBono AI</span>
        </div>

        <div className="relative space-y-10">
          <div>
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">Legal Intelligence Platform</p>
            <h2 className="text-4xl font-bold text-white leading-tight">
              Legal help in<br />plain English
            </h2>
            <p className="text-zinc-400 mt-4 leading-relaxed text-sm max-w-sm">
              Search NSW legislation and caselaw, ask legal questions, and explore case timelines — powered by AI, built for people who need answers.
            </p>
          </div>
          <div className="space-y-3">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-3 text-sm text-zinc-400">
                <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-zinc-600">
          probonoai.com.au · Not legal advice
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm space-y-7">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-gray-900">ProBono AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={() => { window.location.href = `${API}/auth/google` }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl h-11 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or with username</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Username</label>
              <input
                className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl h-11 text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? 'Signing in…' : (
                <>Sign in <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-medium">Demo accounts</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="space-y-2">
            {[
              { label: 'Demo User', sub: 'Guest access', u: 'demo', p: 'demo1234' },
            ].map(({ label, sub, u, p }) => (
              <button
                key={u}
                onClick={() => fillDemo(u, p)}
                className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all group shadow-sm"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </div>
                <span className="text-xs text-emerald-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Autofill <ArrowRight className="w-3 h-3" />
                </span>
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-gray-500">
            New here?{' '}
            <Link href="/register/" className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
              Create a free account
            </Link>
          </p>

          <p className="text-center text-xs text-gray-400">
            Connecting Claude or a GPT?{' '}
            <a href="/connect/" className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
              Get an API token
            </a>
          </p>

        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
