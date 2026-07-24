'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { Copy, Check, Plus, Trash2, Clock, Plug } from 'lucide-react'
import { useAuth } from '@/context/auth'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

type MCPToken = {
  id: string
  name: string
  scopes: string[]
  expires_at: string
  last_used_at: string | null
  created_at: string
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ConnectPage() {
  const { user, token } = useAuth()
  const router = useRouter()

  const [tokens, setTokens]       = useState<MCPToken[]>([])
  const [newName, setNewName]      = useState('')
  const [creating, setCreating]    = useState(false)
  const [newToken, setNewToken]    = useState<string | null>(null)
  const [copied, setCopied]        = useState(false)
  const [copiedCfg, setCopiedCfg] = useState(false)
  const [revoking, setRevoking]    = useState<string | null>(null)
  const [error, setError]          = useState('')

  const loadTokens = useCallback(async () => {
    if (!token) return
    try {
      const r = await fetch(`${API}/auth/mcp/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) setTokens((await r.json()).tokens)
    } catch {}
  }, [token])

  useEffect(() => {
    if (!user) { router.replace('/login/'); return }
    loadTokens()
  }, [user, router, loadTokens])

  async function createToken() {
    if (!token) return
    setCreating(true); setError(''); setNewToken(null)
    try {
      const r = await fetch(`${API}/auth/mcp/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name: newName.trim() || 'My MCP Token', expires_days: 365 }),
      })
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed to create token')
      const data = await r.json()
      setNewToken(data.token)
      setNewName('')
      await loadTokens()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create token')
    } finally {
      setCreating(false)
    }
  }

  async function revokeToken(id: string) {
    if (!token) return
    setRevoking(id)
    try {
      await fetch(`${API}/auth/mcp/token/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setTokens(prev => prev.filter(t => t.id !== id))
    } catch {}
    finally { setRevoking(null) }
  }

  function copy(text: string, which: 'token' | 'cfg') {
    navigator.clipboard.writeText(text)
    if (which === 'token') { setCopied(true);    setTimeout(() => setCopied(false),    2000) }
    else                   { setCopiedCfg(true); setTimeout(() => setCopiedCfg(false), 2000) }
  }

  const cfgSnippet = (t: string) => JSON.stringify({
    mcpServers: {
      'legal-rag': {
        command: 'npx',
        args: [
          'mcp-remote',
          'https://api.probonoai.com.au/mcp',
          '--header',
          `Authorization: Bearer ${t}`,
        ],
      },
    },
  }, null, 2)

  if (!user) return null

  return (
    <>
      <Nav active="connect" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Connect an AI client</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Generate a long-lived MCP token to connect Claude Desktop or any MCP-compatible client.
            Tokens are tied to your account and can be revoked at any time.
          </p>
        </div>

        {/* Create token */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-700">Create new token</p>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm placeholder:text-gray-400"
                placeholder="Token name (e.g. My Claude Desktop)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createToken()}
              />
              <button
                onClick={createToken}
                disabled={creating}
                className="bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm shrink-0"
              >
                {creating
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Plug className="w-3.5 h-3.5" />Generate</>
                }
              </button>
            </div>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">{error}</div>
            )}
            <p className="text-xs text-gray-400">Token expires in 1 year. You can revoke it at any time.</p>
          </div>
        </div>

        {/* New token reveal — shown once */}
        {newToken && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-emerald-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-800">Token created — copy it now</p>
              <span className="text-xs text-emerald-600 bg-emerald-100 rounded-full px-2.5 py-1">
                Shown once only
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 flex items-start justify-between gap-3">
                <p className="text-xs font-mono text-emerald-400 break-all leading-relaxed">{newToken}</p>
                <button
                  onClick={() => copy(newToken, 'token')}
                  className="shrink-0 flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600">Claude Desktop config</p>
                  <button
                    onClick={() => copy(cfgSnippet(newToken), 'cfg')}
                    className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-all bg-white"
                  >
                    {copiedCfg ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCfg ? 'Copied!' : 'Copy config'}
                  </button>
                </div>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800">
                  <pre className="text-xs text-zinc-300 leading-relaxed overflow-x-auto">{cfgSnippet(newToken)}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Token list */}
        {tokens.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold text-gray-700">
                Active tokens <span className="text-gray-400 font-normal">({tokens.length})</span>
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {tokens.map(t => (
                <div key={t.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        Last used: {timeAgo(t.last_used_at)}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">Expires {formatDate(t.expires_at)}</span>
                    </div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {t.scopes.map(s => (
                        <span key={s} className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{s}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeToken(t.id)}
                    disabled={revoking === t.id}
                    title="Revoke token"
                    className="shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                  >
                    {revoking === t.id
                      ? <span className="w-4 h-4 border-2 border-gray-300 border-t-red-400 rounded-full animate-spin block" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tokens.length === 0 && !newToken && (
          <div className="text-center py-12 text-gray-400">
            <Plug className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No active tokens. Create one above.</p>
          </div>
        )}

      </main>
    </>
  )
}
