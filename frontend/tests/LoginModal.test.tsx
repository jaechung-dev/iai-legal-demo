import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import LoginModal from '@/src/components/LoginModal'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({
    login: vi.fn(),
    user: null,
    token: null,
  })),
}))

const { useAuth } = await import('@/context/auth')

function renderModal(onClose = vi.fn()) {
  return render(<MemoryRouter><LoginModal onClose={onClose} /></MemoryRouter>)
}

describe('LoginModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ login: vi.fn(), user: null, token: null } as any)
    onClose.mockClear()
  })

  test('renders username and password inputs', () => {
    renderModal(onClose)
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('renders Google OAuth button', () => {
    renderModal(onClose)
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument()
  })

  test('renders demo account autofill buttons', () => {
    renderModal(onClose)
    expect(screen.getByRole('button', { name: /guest/i })).toBeInTheDocument()
  })

  test('close button calls onClose', () => {
    renderModal(onClose)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  test('shows error when login fails', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'))
    vi.mocked(useAuth).mockReturnValue({ login: mockLogin, user: null, token: null } as any)
    renderModal(onClose)
    fireEvent.change(screen.getByPlaceholderText(/username/i), { target: { value: 'bad@user.com' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() =>
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    )
  })

  test('demo autofill fills username field', () => {
    renderModal(onClose)
    fireEvent.click(screen.getByRole('button', { name: /guest/i }))
    expect(screen.getByPlaceholderText(/username/i)).toHaveValue('demo')
  })

  test('has link to forgot password', () => {
    renderModal(onClose)
    const link = screen.getByRole('link', { name: /forgot password/i })
    expect(link).toHaveAttribute('href', '/forgot-password')
  })

  test('has link to create account', () => {
    renderModal(onClose)
    const link = screen.getByRole('link', { name: /create account/i })
    expect(link).toHaveAttribute('href', '/register')
  })
})
