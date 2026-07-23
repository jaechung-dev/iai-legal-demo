'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Scale, LayoutList, MessageSquare, Search, Plug, LogOut } from 'lucide-react'
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

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 text-sm tracking-tight">ProBono AI</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-0.5 flex-1">
          {LINKS.map(({ href, label, key, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active === key
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Case context + user */}
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xs text-slate-400 hidden md:block">R v Nguyen [2025]</span>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">{user.name}</span>
              <button
                onClick={() => { logout(); router.push('/login/') }}
                title="Sign out"
                className="text-slate-400 hover:text-slate-700 transition-colors p-1"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => router.push('/login/')}
              className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs"
            >
              Sign in
            </Button>
          )}
        </div>

      </div>
    </header>
  )
}
