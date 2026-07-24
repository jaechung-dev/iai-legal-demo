import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { useGuestQuota } from '@/hooks/useGuestQuota'

vi.mock('@/context/auth', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}))

const { useAuth } = await import('@/context/auth')

describe('useGuestQuota', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
  })

  test('gate() returns true for the first question', () => {
    const { result } = renderHook(() => useGuestQuota())
    let allowed: boolean
    act(() => { allowed = result.current.gate() })
    expect(allowed!).toBe(true)
    expect(result.current.showGate).toBe(false)
  })

  test('gate() returns true for the second question', () => {
    localStorage.setItem('iai_anon_count', '1')
    const { result } = renderHook(() => useGuestQuota())
    let allowed: boolean
    act(() => { allowed = result.current.gate() })
    expect(allowed!).toBe(true)
    expect(result.current.showGate).toBe(false)
  })

  test('gate() returns false and shows gate on third question', () => {
    localStorage.setItem('iai_anon_count', '2')
    const { result } = renderHook(() => useGuestQuota())
    let allowed: boolean
    act(() => { allowed = result.current.gate() })
    expect(allowed!).toBe(false)
    expect(result.current.showGate).toBe(true)
  })

  test('gate() always returns true for logged-in users regardless of count', () => {
    localStorage.setItem('iai_anon_count', '99')
    vi.mocked(useAuth).mockReturnValue({
      user: { username: 'jane@example.com', name: 'Jane', role: 'user', email_verified: true },
    } as any)
    const { result } = renderHook(() => useGuestQuota())
    let allowed: boolean
    act(() => { allowed = result.current.gate() })
    expect(allowed!).toBe(true)
    expect(result.current.showGate).toBe(false)
  })

  test('dismissGate sets showGate back to false', () => {
    localStorage.setItem('iai_anon_count', '2')
    const { result } = renderHook(() => useGuestQuota())
    act(() => { result.current.gate() })
    expect(result.current.showGate).toBe(true)
    act(() => { result.current.dismissGate() })
    expect(result.current.showGate).toBe(false)
  })

  test('gate() increments localStorage count', () => {
    const { result } = renderHook(() => useGuestQuota())
    act(() => { result.current.gate() })
    expect(localStorage.getItem('iai_anon_count')).toBe('1')
    act(() => { result.current.gate() })
    expect(localStorage.getItem('iai_anon_count')).toBe('2')
  })
})
