'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/context/auth'

const LINKS = [
  { href: '/',        label: '📋 Timeline', key: 'timeline' },
  { href: '/chat/',   label: '💬 Chat',     key: 'chat'     },
  { href: '/search/', label: '🔍 Search',   key: 'search'   },
  { href: '/connect/', label: '🔌 Connect', key: 'connect'  },
] as const

type Page = typeof LINKS[number]['key']

export default function Nav({ active }: { active: Page }) {
  const { user, logout } = useAuth()
  const router = useRouter()

  function handleLogout() {
    logout()
    router.push('/login/')
  }

  return (
    <header className="bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold tracking-tight">Legal Intelligence Platform</h1>
          <p className="text-slate-400 text-xs mt-0.5">NSW Law · RAG · Plain English</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-slate-700 text-slate-300 hover:bg-slate-700">
            Demo · R v Nguyen [2025]
          </Badge>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">{user.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-slate-400 hover:text-white hover:bg-slate-700 text-xs h-7"
              >
                Sign out
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/login/')}
              className="text-slate-400 hover:text-white hover:bg-slate-700 text-xs h-7"
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
      <Separator className="bg-slate-700" />
      <div className="max-w-6xl mx-auto px-6 flex gap-1">
        {LINKS.map(({ href, label, key }) => (
          <Link
            key={key}
            href={href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active === key
                ? 'border-white text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </header>
  )
}
