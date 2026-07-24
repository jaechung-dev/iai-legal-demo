import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })),
  usePathname: vi.fn(() => '/chat/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    React.createElement('a', { href, ...props }, children),
}))
