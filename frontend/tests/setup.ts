import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'
import React from 'react'

// ── localStorage stub (jsdom env may not provide one) ─────────────────────────
const store: Record<string, string> = {}
const localStorageMock = {
  getItem:    (k: string): string | null => store[k] ?? null,
  setItem:    (k: string, v: string): void => { store[k] = v },
  removeItem: (k: string): void => { delete store[k] },
  clear:      (): void => { Object.keys(store).forEach(k => delete store[k]) },
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

beforeEach(() => {
  // Reset localStorage between tests
  Object.keys(store).forEach(k => delete store[k])
})

// ── Next.js navigation mock ───────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter:      vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })),
  usePathname:    vi.fn(() => '/chat/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement('a', { href, ...props }, children),
}))
