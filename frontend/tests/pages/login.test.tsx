import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import LoginPage from '@/src/pages/LoginPage'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({
    login: vi.fn(),
    user: null,
    token: null,
  })),
}))

const { useAuth } = await import('@/context/auth')

function renderLogin(search = '') {
  return render(<MemoryRouter initialEntries={[`/login${search}`]}><LoginPage /></MemoryRouter>)
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ login: vi.fn(), user: null, token: null } as any)
  })

  test('renders username and password inputs', () => {
    renderLogin()
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('renders Google OAuth button', () => {
    renderLogin()
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })

  test('has link to create account', () => {
    renderLogin()
    const link = screen.getByRole('link', { name: /create a free account/i })
    expect(link).toHaveAttribute('href', '/register')
  })

  test('has forgot password link', () => {
    renderLogin()
    const link = screen.getByRole('link', { name: /forgot password/i })
    expect(link).toHaveAttribute('href', '/forgot-password')
  })

  test('shows error on failed login', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid email or password'))
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, user: null, token: null } as any)
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'bad@user.com' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    )
  })

  test('shows verified banner when ?verified=1 param is set', () => {
    renderLogin('?verified=1')
    expect(screen.getByText(/email verified/i)).toBeInTheDocument()
  })

  test('shows reset banner when ?reset=1 param is set', () => {
    renderLogin('?reset=1')
    expect(screen.getByText(/password.*reset/i)).toBeInTheDocument()
  })

  test('shows invalid link error when ?error=invalid_link', () => {
    renderLogin('?error=invalid_link')
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
  })

  test('demo autofill button fills username', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /guest/i }))
    expect(screen.getByPlaceholderText(/username/i)).toHaveValue('demo')
  })

  test('calls login with entered credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, user: null, token: null } as any)
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'demo' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('demo', ''))
  })
})
