import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useSearchParams } from 'next/navigation'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import ResetPasswordPage from '@/app/reset-password/page'

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn() }))
  })

  test('renders page heading', () => {
    render(<ResetPasswordPage />)
    expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument()
  })

  test('shows invalid link error when no token in URL', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams())
    render(<ResetPasswordPage />)
    await waitFor(() =>
      expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument()
    )
  })

  test('renders password form when token is present', () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('token=valid-token-123'))
    render(<ResetPasswordPage />)
    expect(screen.getByPlaceholderText(/min. 8 characters/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/repeat your password/i)).toBeInTheDocument()
  })

  test('shows password strength indicator as user types', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('token=valid-token-123'))
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'abc' } })
    await waitFor(() =>
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    )
  })

  test('shows passwords do not match error', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('token=valid-token-123'))
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'SecurePass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'Different99!' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    await waitFor(() =>
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    )
  })

  test('submit button is disabled when no token', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams())
    render(<ResetPasswordPage />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /set new password/i })
      expect(btn).toBeDisabled()
    })
  })

  test('shows error from API on failed reset', async () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('token=expired-token'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: 'Reset token expired' }),
    }))
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'NewPass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'NewPass99!' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    await waitFor(() =>
      expect(screen.getByText(/reset token expired/i)).toBeInTheDocument()
    )
  })
})
