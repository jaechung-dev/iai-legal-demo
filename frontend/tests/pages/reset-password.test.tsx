import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import ResetPasswordPage from '@/src/pages/ResetPasswordPage'

function renderPage(search = '') {
  return render(<MemoryRouter initialEntries={[`/reset-password${search}`]}><ResetPasswordPage /></MemoryRouter>)
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn() }))
  })

  test('renders page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument()
  })

  test('shows invalid link error when no token in URL', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument()
    )
  })

  test('renders password form when token is present', () => {
    renderPage('?token=valid-token-123')
    expect(screen.getByPlaceholderText(/min. 8 characters/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/repeat your password/i)).toBeInTheDocument()
  })

  test('shows password strength indicator as user types', async () => {
    renderPage('?token=valid-token-123')
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'abc' } })
    await waitFor(() =>
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    )
  })

  test('shows passwords do not match error', async () => {
    renderPage('?token=valid-token-123')
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'SecurePass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'Different99!' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    await waitFor(() =>
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    )
  })

  test('submit button is disabled when no token', async () => {
    renderPage()
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /set new password/i })
      expect(btn).toBeDisabled()
    })
  })

  test('shows error from API on failed reset', async () => {
    renderPage('?token=expired-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ detail: 'Reset token expired' }),
    }))
    fireEvent.change(screen.getByPlaceholderText(/min. 8 characters/i), { target: { value: 'NewPass99!' } })
    fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: 'NewPass99!' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
    await waitFor(() =>
      expect(screen.getByText(/reset token expired/i)).toBeInTheDocument()
    )
  })
})
