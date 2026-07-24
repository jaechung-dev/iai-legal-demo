'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Scale, LayoutList, MessageSquare, Search, Plug, LogOut, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/auth'

const LINKS = [
  { href: '/',         label: 'Timeline', key: 'timeline', Icon: LayoutList   },
  { href: '/chat/',    label: 'Chat',     key: 'chat',     Icon: MessageSquare },
  { href: '/search/',  label: 'Search',   key: 'search',   Icon: Search        },
  { href: '/connect/', label: 'Connect',  key: 'connect',  Icon: Plug          },
] as const

type Page = typeof LINKS[number]['key']

export default function Nav({ active }: { active: Page }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight hidden sm:block">ProBono AI</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {LINKS.map(({ href, label, key, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                active === key
                  ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-4 shrink-0 ml-auto">
          <span className="text-xs text-zinc-600 hidden lg:block px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
            R v Nguyen [2025]
          </span>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-300">{user.name}</span>
              <button
                onClick={() => { logout(); router.push('/login/') }}
                title="Sign out"
                className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => router.push('/login/')}
              className="bg-emerald-600 hover:bg-emerald-500 h-8 text-xs text-white border-0 shadow-lg shadow-emerald-500/20"
            >
              Sign in
            </Button>
          )}
        </div>

        {/* Mobile: icon-only links + hamburger */}
        <div className="flex md:hidden items-center gap-1 ml-auto">
          {LINKS.map(({ href, key, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`p-2 rounded-md transition-all ${
                active === key
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

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between py-2 border-b border-zinc-800 mb-2">
            <span className="text-xs text-zinc-500 font-mono">R v Nguyen [2025]</span>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-400">{user.name}</span>
                <button
                  onClick={() => { logout(); router.push('/login/'); setMobileOpen(false) }}
                  className="text-zinc-500 hover:text-white p-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={() => { router.push('/login/'); setMobileOpen(false) }}
                className="bg-emerald-600 hover:bg-emerald-500 h-7 text-xs text-white border-0"
              >
                Sign in
              </Button>
            )}
          </div>
          {LINKS.map(({ href, label, key, Icon }) => (
            <Link
              key={key}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                active === key
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
