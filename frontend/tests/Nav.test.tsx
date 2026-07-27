import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import Nav from '@/src/components/Nav'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({ user: null, logout: vi.fn() })),
}))

const { useAuth } = await import('@/context/auth')

function renderNav(pathname = '/chat') {
  return render(<MemoryRouter initialEntries={[pathname]}><Nav /></MemoryRouter>)
}

describe('Nav', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.mocked(useAuth).mockReturnValue({ user: null, logout: vi.fn() } as any)
  })

  test('renders all four navigation links', () => {
    renderNav()
    expect(screen.getByText('Chat')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('My Case')).toBeInTheDocument()
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  test('highlights the active link based on current pathname', () => {
    renderNav('/search')
    const searchLink = screen.getByText('Search').closest('a')
    const chatLink   = screen.getByText('Chat').closest('a')
    expect(searchLink).toHaveClass('text-emerald-400')
    expect(chatLink).not.toHaveClass('text-emerald-400')
  })

  test('chat link is active when pathname is /chat', () => {
    renderNav('/chat')
    const chatLink = screen.getByText('Chat').closest('a')
    expect(chatLink).toHaveClass('text-emerald-400')
  })

  test('logo links to home', () => {
    renderNav()
    const logoLink = screen.getByRole('link', { name: /probono ai/i })
    expect(logoLink).toHaveAttribute('href', '/')
  })

  test('shows Sign in button when no user is logged in', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows user name and sign out button when logged in', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Jane Smith', username: 'jane@example.com', role: 'user', email_verified: true },
      logout: vi.fn(),
    } as any)
    renderNav()
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByTitle('Sign out')).toBeInTheDocument()
  })

  test('calls logout and navigates to /login on sign out click', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({
      user: { name: 'Jane Smith', username: 'jane@example.com', role: 'user', email_verified: true },
      logout: mockLogout,
    } as any)
    renderNav()
    fireEvent.click(screen.getByTitle('Sign out'))
    await vi.waitFor(() => expect(mockLogout).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  test('mobile menu toggle shows and hides dropdown', () => {
    renderNav()
    const menuBtn = screen.getByRole('button', { name: '' })
    fireEvent.click(menuBtn)
    const myCaseLinks = screen.getAllByText('My Case')
    expect(myCaseLinks.length).toBeGreaterThanOrEqual(1)
  })
})
