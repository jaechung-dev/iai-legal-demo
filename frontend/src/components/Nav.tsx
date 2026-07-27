import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Scale, MessageSquare, Search, Plug, LogOut, Menu, X, ClipboardList } from 'lucide-react'
import { useAuth } from '@/context/auth'
import { APP_NAME, FEATURED_CASE } from '@/lib/config'

const LINKS = [
  { to: '/chat',     label: 'Chat',    Icon: MessageSquare },
  { to: '/search',   label: 'Search',  Icon: Search        },
  { to: '/my-case',  label: 'My Case', Icon: ClipboardList },
  { to: '/connect',  label: 'Connect', Icon: Plug          },
] as const

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  function isActive(to: string) {
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight hidden sm:block">{APP_NAME}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {LINKS.map(({ to, label, Icon }) => (
            <Link key={to} to={to}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                isActive(to)
                  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4 shrink-0 ml-auto">
          <span className="text-xs text-zinc-600 hidden lg:block px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            {FEATURED_CASE}
          </span>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-300">{user.name}</span>
              <button
                onClick={async () => { await logout(); navigate('/login') }}
                title="Sign out"
                className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="bg-emerald-600 hover:bg-emerald-500 h-8 px-3 text-xs text-white rounded-md font-medium transition-all shadow-lg shadow-emerald-500/20"
            >
              Sign in
            </button>
          )}
        </div>

        <div className="flex md:hidden items-center gap-1 ml-auto">
          {LINKS.map(({ to, Icon }) => (
            <Link key={to} to={to}
              className={`p-2 rounded-md transition-all ${
                isActive(to)
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-zinc-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
            </Link>
          ))}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-md transition-all"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between py-2 border-b border-zinc-800 mb-2">
            <span className="text-xs text-zinc-500 font-mono">{FEATURED_CASE}</span>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">{user.name}</span>
                <button
                  onClick={async () => { await logout(); navigate('/login'); setMobileOpen(false) }}
                  className="text-zinc-500 hover:text-white p-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { navigate('/login'); setMobileOpen(false) }}
                className="bg-emerald-600 hover:bg-emerald-500 h-7 px-3 text-xs text-white rounded-md font-medium"
              >
                Sign in
              </button>
            )}
          </div>
          {LINKS.map(({ to, label, Icon }) => (
            <Link key={to} to={to} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                isActive(to)
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
