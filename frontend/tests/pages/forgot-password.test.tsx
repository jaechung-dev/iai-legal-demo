import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import ForgotPasswordPage from '@/app/forgot-password/page'

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  test('renders the email form', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  test('has a link back to sign in', () => {
    render(<ForgotPasswordPage />)
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link).toHaveAttribute('href', '/login/')
  })

  test('shows check inbox message after submit', async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument()
    )
  })

  test('shows the submitted email in the success message', async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByText('user@example.com')).toBeInTheDocument()
    )
  })

  test('shows back to sign in link after success', async () => {
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => screen.getByText(/check your inbox/i))
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })

  test('shows error message on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    )
  })
})
