'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scale, ArrowRight, Check, Search, MessageSquare, Clock, Plug } from 'lucide-react'
import { useAuth } from '@/context/auth'
import LoginModal from '@/components/LoginModal'

const FEATURES = [
  { icon: Search,        text: 'NSW legislation & caselaw search' },
  { icon: MessageSquare, text: 'Plain English answers with citations' },
  { icon: Clock,         text: 'AI-powered case timeline analysis' },
  { icon: Plug,          text: 'Connect Claude via MCP' },
]

function isStage() {
  if (typeof window === 'undefined') return false
  return window.location.hostname.startsWith('stage.')
}

export default function LandingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isStage()) {
      router.replace('/chat/')
      return
    }
    // On www: if already logged in, go straight to chat
    if (user) {
      router.replace('/chat/')
      return
    }
    setReady(true)
  }, [user, router])

  if (!ready) return null

  return (
    <>
      {showModal && <LoginModal onClose={() => setShowModal(false)} />}

      <div className="min-h-screen flex flex-col bg-white">

        {/* Nav */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-950 rounded-xl flex items-center justify-center">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">ProBono AI</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-3xl mx-auto w-full">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-widest">Legal Intelligence Platform</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
            Legal help in<br />
            <span className="text-emerald-500">plain English</span>
          </h1>

          <p className="text-lg text-gray-500 max-w-xl mb-10 leading-relaxed">
            Search NSW legislation and caselaw, ask legal questions, and analyse case timelines — powered by AI, built for people who need answers.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-16">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl px-8 py-3.5 text-sm font-semibold transition-all shadow-lg"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl px-8 py-3.5 text-sm font-semibold transition-all"
            >
              Sign in
            </button>
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-sm text-gray-700 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </main>

        <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
          probonoai.com.au · Not legal advice
        </footer>
      </div>
    </>
  )
}
