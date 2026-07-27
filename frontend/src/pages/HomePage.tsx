import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search, MessageSquare, Clock, Plug, LogIn } from 'lucide-react'
import { useAuth } from '@/context/auth'
import LoginModal from '../components/LoginModal'
import { APP_DOMAIN, APP_NAME } from '@/lib/config'

const FEATURES = [
  { icon: Search,        text: 'NSW legislation & caselaw search' },
  { icon: MessageSquare, text: 'Plain English answers with citations' },
  { icon: Clock,         text: 'AI-powered case timeline analysis' },
  { icon: Plug,          text: 'Connect Claude via MCP' },
]

const SAMPLE_QUESTIONS = [
  'What are my rights if my landlord won\'t fix the heating?',
  'Can my employer make me work overtime without extra pay?',
  'How long do I have to file a civil claim in NSW?',
  'What happens at a first court mention?',
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

      <div className="min-h-screen flex flex-col bg-zinc-950 text-white">
        {/* Nav */}
        <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            {/* Logo mark — Lady Justice scales portion */}
            <div className="w-9 h-9 rounded-xl border border-zinc-700 overflow-hidden shrink-0" style={{ background: '#0a0a0a' }}>
              <div style={{
                width: '100%', height: '100%',
                backgroundImage: 'url(/justiti.png)',
                backgroundSize: '320% auto',
                backgroundPosition: '36% 8%',
                backgroundRepeat: 'no-repeat',
                filter: 'invert(1) brightness(0.9)',
              }} />
            </div>
            <span className="font-serif text-lg font-semibold text-white tracking-wide">{APP_NAME}</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Sign in <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* Hero — full viewport */}
        <section className="flex-1 flex flex-col lg:flex-row" style={{ minHeight: '100svh' }}>
          {/* Left — content */}
          <div className="flex flex-col justify-center px-8 sm:px-16 lg:px-24 pt-28 pb-16 lg:py-0 lg:w-[58%] z-10">
            <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/50 rounded-full px-4 py-1.5 mb-8 self-start">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Free · NSW · AI-powered</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl xl:text-[4.25rem] font-bold text-white leading-[1.1] tracking-tight mb-4">
              Free legal help<br />
              <span className="text-emerald-400">in plain English</span>
            </h1>

            <p className="text-sm text-zinc-500 uppercase tracking-widest font-medium mb-6">
              Legal research & AI guidance for everyday Australians
            </p>

            <div className="border-l-2 border-emerald-500/40 pl-5 mb-5">
              <p className="text-base text-zinc-300 leading-relaxed">
                We believe everyone deserves to understand their legal situation — not just those who can afford a lawyer. ProBono AI was built to close that gap.
              </p>
            </div>

            <p className="text-sm text-zinc-500 max-w-lg mb-10 leading-relaxed">
              Get <span className="text-zinc-300">personalised legal guidance</span> tailored to your situation.
              Search NSW legislation and case law, ask questions in plain English, and receive AI-powered analysis
              grounded in real court decisions and statutes — all in one place, at no cost.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl px-8 py-3.5 text-sm font-bold transition-all shadow-lg shadow-emerald-900/30"
              >
                Get started free <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center justify-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white rounded-xl px-8 py-3.5 text-sm font-semibold transition-all"
              >
                Sign in
              </button>
            </div>

            {/* Demo login prompt */}
            <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 mb-8 max-w-lg">
              <LogIn className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs text-zinc-400">
                Try the demo instantly —{' '}
                <button onClick={() => setShowModal(true)} className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
                  sign in
                </button>
                {' '}with <span className="font-mono text-zinc-300">demo</span> / <span className="font-mono text-zinc-300">demo1234</span>
              </p>
            </div>

            {/* Sample questions */}
            <div className="max-w-lg">
              <p className="text-xs text-zinc-600 uppercase tracking-widest font-medium mb-3">Example questions</p>
              <div className="space-y-2">
                {SAMPLE_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => setShowModal(true)}
                    className="w-full text-left flex items-start gap-3 bg-zinc-900/50 hover:bg-zinc-800/70 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-all group"
                  >
                    <Search className="w-3.5 h-3.5 text-zinc-600 group-hover:text-emerald-400 mt-0.5 shrink-0 transition-colors" />
                    <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors leading-snug">{q}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-emerald-400 ml-auto shrink-0 mt-0.5 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Lady Justice (background-image for precise positioning) */}
          <div className="hidden lg:block lg:w-[42%] relative overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'url(/justiti.png)',
                backgroundSize: 'auto 92%',
                backgroundPosition: '38% bottom',
                backgroundRepeat: 'no-repeat',
                filter: 'invert(1) brightness(0.75)',
              }}
            />
            {/* fade into left edge */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-zinc-950 to-transparent pointer-events-none z-10" />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-800/60 bg-zinc-950">
          <div className="max-w-6xl mx-auto px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg border border-zinc-700 overflow-hidden shrink-0" style={{ background: '#0a0a0a' }}>
                <div style={{
                  width: '100%', height: '100%',
                  backgroundImage: 'url(/justiti.png)',
                  backgroundSize: '320% auto',
                  backgroundPosition: '36% 8%',
                  backgroundRepeat: 'no-repeat',
                  filter: 'invert(1) brightness(0.9)',
                }} />
              </div>
              <div>
                <p className="font-serif font-semibold text-white text-sm">{APP_NAME}</p>
                <p className="text-xs text-zinc-600 mt-0.5">Not legal advice · For informational purposes only</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <button onClick={() => setShowModal(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Search</button>
              <button onClick={() => setShowModal(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Ask a question</button>
              <button onClick={() => setShowModal(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Connect AI</button>
              <span className="text-xs text-zinc-700">{APP_DOMAIN}</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
