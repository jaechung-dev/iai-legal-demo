import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Scale, ArrowRight } from 'lucide-react'
import { API_URL as API, APP_NAME } from '@/lib/config'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-7">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="font-bold text-gray-900">{APP_NAME}</span>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Check your inbox</h1>
              <p className="text-sm text-gray-500 mt-1">
                If <span className="font-medium text-gray-700">{email}</span> is registered, a reset link is on its way. It expires in 1 hour.
              </p>
            </div>
            <Link to="/login" className="flex items-center gap-1.5 text-sm text-emerald-600 hover:underline">
              Back to sign in <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Forgot password?</h1>
              <p className="text-sm text-gray-500 mt-1">Enter your email and we'll send a reset link.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl h-11 text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? 'Sending…' : <><span>Send reset link</span><ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
            <p className="text-sm text-gray-500">
              Remember it?{' '}
              <Link to="/login" className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
