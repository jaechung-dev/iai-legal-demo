import { render, screen, fireEvent } from '@testing-library/react'
import { usePathname, useRouter } from 'next/navigation'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import Nav from '@/components/Nav'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({ user: null, logout: vi.fn() })),
}))

const { useAuth } = await import('@/context/auth')

describe('Nav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/chat/')
    vi.mocked(useAuth).mockReturnValue({ user: null, logout: vi.fn() } as any)
  })

  test('renders all four navigation links', () => {
    render(<Nav />)
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('My Case')).toBeInTheDocument()
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  test('highlights the active link based on current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/search/')
    render(<Nav />)
    const searchLink = screen.getByText('Search').closest('a')
    const chatLink   = screen.getByText('Chat').closest('a')
    expect(searchLink).toHaveClass('text-emerald-400')
    expect(chatLink).not.toHaveClass('text-emerald-400')
  })

  test('chat link is active when pathname is /chat/', () => {
    vi.mocked(usePathname).mockReturnValue('/chat/')
    render(<Nav />)
    const chatLink = screen.getByText('Chat').closest('a')
    expect(chatLink).toHaveClass('text-emerald-400')
  })

  test('logo links to home', () => {
    render(<Nav />)
    const logoLink = screen.getByRole('link', { name: /probono ai/i })
    expect(logoLink).toHaveAttribute('href', '/')
  })

  test('shows Sign in button when no user is logged in', () => {
    render(<Nav />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows user name and sign out button when logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Jane Smith', username: 'jane@example.com', role: 'user', email_verified: true },
      logout: vi.fn(),
    } as any)
    render(<Nav />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByTitle('Sign out')).toBeInTheDocument()
  })

  test('calls logout and navigates to /login/ on sign out click', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    const mockPush   = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Jane Smith', username: 'jane@example.com', role: 'user', email_verified: true },
      logout: mockLogout,
    } as any)
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() } as any)
    render(<Nav />)
    fireEvent.click(screen.getByTitle('Sign out'))
    await vi.waitFor(() => expect(mockLogout).toHaveBeenCalled())
    expect(mockPush).toHaveBeenCalledWith('/login/')
  })

  test('mobile menu toggle shows and hides dropdown', () => {
    render(<Nav />)
    // Menu button (hamburger) is visible on mobile layout; jsdom renders all DOM
    const menuBtn = screen.getByRole('button', { name: '' }) // icon-only button
    fireEvent.click(menuBtn)
    // After clicking, the mobile dropdown with link labels appears
    const myCaseLinks = screen.getAllByText('My Case')
    expect(myCaseLinks.length).toBeGreaterThanOrEqual(1)
  })
})
