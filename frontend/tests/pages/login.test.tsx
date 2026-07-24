import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSearchParams } from 'next/navigation'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import LoginPage from '@/app/login/page'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({
    login: vi.fn(),
    user: null,
    token: null,
  })),
}))

const { useAuth } = await import('@/context/auth')

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ login: vi.fn(), user: null, token: null } as any)
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams())
  })

  test('renders username and password inputs', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('renders Google OAuth button', () => {
    render(<LoginPage />)
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })

  test('has link to create account', () => {
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: /create a free account/i })
    expect(link).toHaveAttribute('href', '/register/')
  })

  test('has forgot password link', () => {
    render(<LoginPage />)
    const link = screen.getByRole('link', { name: /forgot password/i })
    expect(link).toHaveAttribute('href', '/forgot-password/')
  })

  test('shows error on failed login', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid email or password'))
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, user: null, token: null } as any)
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'bad@user.com' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    )
  })

  test('shows verified banner when ?verified=1 param is set', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('verified=1'))
    render(<LoginPage />)
    expect(screen.getByText(/email verified/i)).toBeInTheDocument()
  })

  test('shows reset banner when ?reset=1 param is set', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('reset=1'))
    render(<LoginPage />)
    expect(screen.getByText(/password.*reset/i)).toBeInTheDocument()
  })

  test('shows invalid link error when ?error=invalid_link', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('error=invalid_link'))
    render(<LoginPage />)
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  test('demo autofill button fills username', () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /guest/i }))
    expect(screen.getByPlaceholderText(/username/i)).toHaveValue('demo')
  })

  test('calls login with entered credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, user: null, token: null } as any)
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'demo' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('demo', ''))
  })
})
