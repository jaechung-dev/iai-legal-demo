import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ArrowRight, Check, Scale } from 'lucide-react'
import { useAuth } from '@/context/auth'
import { API_URL as API, APP_NAME } from '@/lib/config'

const FEATURES = [
  'NSW legislation & caselaw search',
  'Plain English answers with citations',
  'AI-powered case timeline analysis',
  'Connect Claude via MCP',
]

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/chat')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all">
          <X className="w-4 h-4" />
        </button>

        <div className="bg-zinc-950 px-8 pt-8 pb-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Scale className="w-4 h-4 text-zinc-950" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white">{APP_NAME}</span>
          </div>
          <div className="w-8 h-px bg-amber-500/60 mb-3" />
          <h2 className="text-xl font-bold text-white">
            You&rsquo;ve used your <span className="text-rose-400">2 free messages</span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Create a free account or sign in to keep asking — it only takes a moment.
          </p>
          <div className="mt-4 space-y-2">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-4 h-4 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-rose-400" />
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        <div className="px-8 py-6 space-y-4">
          <button type="button" onClick={() => navigate('/register')}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-amber-400 to-amber-600 text-zinc-950 rounded-xl h-11 text-sm font-semibold hover:from-amber-300 hover:to-amber-500 transition-all shadow-lg shadow-amber-500/20">
            Create free account <ArrowRight className="w-4 h-4" />
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-500 font-medium">or sign in</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button type="button" onClick={() => { window.location.href = `${API}/auth/google` }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl h-11 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
            <GoogleIcon />Continue with Google
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-500 font-medium">or with username</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
              placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
            <input type="password" className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
              placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            {error && <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl h-11 text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
              {loading ? 'Signing in…' : <><span>Sign in</span><ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <a href="/forgot-password" className="text-rose-600 hover:underline">Forgot password?</a>
            <a href="/register" className="text-rose-600 hover:underline">Create account</a>
          </div>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-500 font-medium">Guest accounts</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <button onClick={() => fillDemo('demo', 'demo1234')}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-rose-300 hover:bg-rose-50/30 transition-all group shadow-sm">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Guest</p>
              <p className="text-xs text-gray-500 mt-0.5">Guest access</p>
            </div>
            <span className="text-xs text-rose-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              Autofill <ArrowRight className="w-3 h-3" />
            </span>
          </button>
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
