import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ArrowRight, Search, MessageSquare, Clock, Plug } from 'lucide-react'
import { useAuth } from '@/context/auth'
import LoginModal from '../components/LoginModal'
import { APP_DOMAIN, APP_NAME } from '@/lib/config'

const FEATURES = [
  { icon: Search,        text: 'NSW legislation & caselaw search' },
  { icon: MessageSquare, text: 'Plain English answers with citations' },
  { icon: Clock,         text: 'AI-powered case timeline analysis' },
  { icon: Plug,          text: 'Connect Claude via MCP' },
]

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showModal, setShowModal] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.location.hostname.startsWith('stage.')) {
      navigate('/chat', { replace: true })
      return
    }
    if (user) {
      navigate('/chat', { replace: true })
      return
    }
    setReady(true)
  }, [user, navigate])

  if (!ready) return null

  return (
    <>
      {showModal && <LoginModal onClose={() => setShowModal(false)} />}
      <div className="min-h-screen flex flex-col bg-white">
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-950 rounded-xl flex items-center justify-center">
              <Scale className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="font-bold text-gray-900 tracking-tight">{APP_NAME}</span>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 max-w-3xl mx-auto w-full">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-widest">Free · NSW · AI-powered</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
            Free legal help<br />
            <span className="text-emerald-500">in plain English</span>
          </h1>

          <p className="text-lg text-gray-500 max-w-xl mb-10 leading-relaxed">
            Search NSW legislation and caselaw, get answers to legal questions, and understand your case — AI-powered, free to use, built for people who need real answers.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-16">
            <button onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl px-8 py-3.5 text-sm font-semibold transition-all shadow-lg">
              Get started <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => setShowModal(true)}
              className="flex items-center justify-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl px-8 py-3.5 text-sm font-semibold transition-all">
              Sign in
            </button>
          </div>

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
          {`${APP_DOMAIN} · Not legal advice`}
        </footer>
      </div>
    </>
  )
}
