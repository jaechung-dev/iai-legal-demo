'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Scale } from 'lucide-react'
import { useAuth } from '@/context/auth'

function CallbackHandler() {
  const router = useRouter()
  const params = useSearchParams()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const token   = params.get('token')
    const refresh = params.get('refresh') ?? undefined
    if (!token) {
      setError('No token received from OAuth provider.')
      return
    }
    try {
      loginWithToken(token, refresh)
      router.push('/chat/')
    } catch {
      setError('Failed to sign in. Please try again.')
    }
  }, [params, loginWithToken, router])

  if (error) {
    return (
      <div className="text-center space-y-3">
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <a href="/login/" className="text-sm text-emerald-600 hover:underline">Back to sign in</a>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <p className="text-sm font-medium text-gray-700">Signing you in…</p>
      <div className="flex justify-center gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 bg-zinc-950 rounded-xl flex items-center justify-center mx-auto">
          <Scale className="w-6 h-6 text-emerald-400" />
        </div>
        <Suspense fallback={
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        }>
          <CallbackHandler />
        </Suspense>
      </div>
    </div>
  )
}
