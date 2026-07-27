import { API_URL } from './config'
import type { MCPToken } from '@/types/mcp'
import type { CaseSummary, CaseDetail, CaseEvent, FileMeta } from '@/types/case'
import type { ConvSummary, ChatMessage, ChatSource } from '@/types/chat'
import type { SearchResult, SearchSource } from '@/types/search'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...init } = options
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (init.body && typeof init.body === 'string') headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.detail ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── MCP tokens ────────────────────────────────────────────────────────────────

export const mcp = {
  list: (token: string) =>
    request<{ tokens: MCPToken[] }>('/auth/mcp/tokens', { token }).then(r => r.tokens),

  create: (token: string, name: string, expires_days = 365) =>
    request<{ token: string }>('/auth/mcp/token', {
      method: 'POST',
      body: JSON.stringify({ name, expires_days }),
      token,
    }),

  revoke: (token: string, id: string) =>
    request<void>(`/auth/mcp/token/${id}`, { method: 'DELETE', token }),
}

// ── Cases ─────────────────────────────────────────────────────────────────────

export const cases = {
  list: (token: string) =>
    request<CaseSummary[]>('/user/cases', { token }),

  get: (token: string, id: string) =>
    request<CaseDetail>(`/case/${id}`, { token }),

  delete: (token: string, id: string) =>
    request<void>(`/case/${id}`, { method: 'DELETE', token }),

  patchFiles: (token: string, id: string, files: FileMeta[]) =>
    request<void>(`/case/${id}/files`, {
      method: 'PATCH',
      body: JSON.stringify({ files }),
      token,
    }),

  timeline: (id: string) =>
    request<{ events: CaseEvent[] }>(`/case/${id}/timeline`).then(r => r.events),

  uploadUrl: (token: string, filename: string, content_type: string, case_id: string) =>
    request<{ upload_url: string; key: string }>('/intake/upload-url', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type, case_id }),
      token,
    }),
}

// ── Conversations ─────────────────────────────────────────────────────────────

export const conversations = {
  list: (token: string) =>
    request<ConvSummary[]>('/conversations', { token }),

  get: (token: string, id: string) =>
    request<{ messages: Array<ChatMessage & { sources?: ChatSource[] }>; case_id: string | null }>(
      `/conversations/${id}`,
      { token },
    ),

  create: (token: string, title: string, case_id: string | null) =>
    request<ConvSummary>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, case_id }),
      token,
    }),

  delete: (token: string, id: string) =>
    request<void>(`/conversations/${id}`, { method: 'DELETE', token }),

  saveMessages: (
    token: string,
    id: string,
    messages: Array<{ role: string; content: string; sources?: ChatSource[] | null }>,
  ) =>
    request<void>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(messages),
      token,
    }),
}

// ── Search ────────────────────────────────────────────────────────────────────

export const search = {
  query: (query: string, source: SearchSource, k = 8) =>
    request<{ results: SearchResult[] }>('/search', {
      method: 'POST',
      body: JSON.stringify({ query, source, k }),
    }),
}

// ── User ──────────────────────────────────────────────────────────────────────

export const user = {
  case: (token: string) =>
    request<{ case: { id: string; matter: Record<string, string> } | null }>('/user/case', { token }),
}

export { ApiError }
