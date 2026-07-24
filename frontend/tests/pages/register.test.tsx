import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import RegisterPage from '@/app/register/page'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({
    register: vi.fn().mockResolvedValue({ email_verified: false }),
    user: null,
  })),
}))

const { useAuth } = await import('@/context/auth')

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      register: vi.fn().mockResolvedValue({ email_verified: false }),
      user: null,
    } as any)
  })

  test('renders all form fields', () => {
    render(<RegisterPage />)
    expect(screen.getByPlaceholderText(/jane smith/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/min. 8 characters/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/repeat your password/i)).toBeInTheDocument()
  })

  test('renders Google OAuth button', () => {
    render(<RegisterPage />)
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })

  test('has link back to sign in', () => {
    render(<RegisterPage />)
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link).toHaveAttribute('href', '/login/')
  })

  test('shows error when passwords do not match', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    )
  })

  test('shows error when password is too short', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    )
  })

  test('shows weak password indicator for short passwords', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'abc' } })
    await waitFor(() =>
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    )
  })

  test('shows fair password indicator for medium passwords', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'abcdefgh' } })
    await waitFor(() =>
      expect(screen.getByText(/fair password/i)).toBeInTheDocument()
    )
  })

  test('shows verify email screen after successful registration', async () => {
    const mockRegister = vi.fn().mockResolvedValue({ email_verified: false })
    vi.mocked(useAuth).mockReturnValue({ register: mockRegister, user: null } as any)
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Jane Smith' } })
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'SecurePass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'SecurePass99!' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText(/check your email/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: /continue to app/i })).toBeInTheDocument()
  })

  test('shows registered email in verify screen', async () => {
    const mockRegister = vi.fn().mockResolvedValue({ email_verified: false })
    vi.mocked(useAuth).mockReturnValue({ register: mockRegister, user: null } as any)
    render(<RegisterPage />)
    fireEvent.change(screen.getByPlaceholderText(/jane smith/i), { target: { value: 'Jane Smith' } })
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), { target: { value: 'jane@example.com' } })
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'SecurePass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'SecurePass99!' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    )
  })
})
