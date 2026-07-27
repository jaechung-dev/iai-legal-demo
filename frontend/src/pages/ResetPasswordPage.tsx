import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Scale, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { API_URL as API, APP_NAME } from '@/lib/config'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token    = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!token) setError('Invalid reset link. Please request a new one.')
  }, [token])

  const strength = password.length === 0 ? null
    : password.length < 8  ? 'weak'
    : password.length < 12 ? 'fair'
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 'strong' : 'good'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Reset failed')
      }
      navigate('/login?reset=1')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed')
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Set new password</h1>
          <p className="text-sm text-gray-500 mt-1">Choose a strong password for your account.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">New password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className="w-full border border-gray-200 bg-white rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm"
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={!token}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {strength && (
              <div className="space-y-1">
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-1 rounded-full transition-all ${
                    strength === 'weak' ? 'w-1/4 bg-rose-400' :
                    strength === 'fair' ? 'w-2/4 bg-amber-400' :
                    strength === 'good' ? 'w-3/4 bg-emerald-400' : 'w-full bg-emerald-500'
                  }`} />
                </div>
                <p className={`text-xs capitalize ${
                  strength === 'weak' ? 'text-rose-500' :
                  strength === 'fair' ? 'text-amber-500' : 'text-emerald-600'
                }`}>{strength} password</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Confirm password</label>
            <input
              type="password"
              className={`w-full border bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm ${
                confirm && confirm !== password ? 'border-rose-300' : 'border-gray-200'
              }`}
              placeholder="Repeat your password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              disabled={!token}
            />
          </div>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}{' '}
              {error.includes('Invalid') && (
                <Link to="/forgot-password" className="underline">Request a new link</Link>
              )}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl h-11 text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? 'Resetting…' : <><span>Set new password</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>
      </div>
    </div>
  )
}
