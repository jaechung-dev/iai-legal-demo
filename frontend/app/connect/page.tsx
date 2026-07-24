'use client'

import { useState } from 'react'
import Nav from '@/components/Nav'
import { Separator } from '@/components/ui/separator'
import { Copy, Check, ChevronRight } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

const SCOPES = [
  { id: 'search',   label: 'Search',   desc: 'Semantic search over NSW legislation and caselaw' },
  { id: 'ask',      label: 'Ask',      desc: 'RAG-powered Q&A with source citations' },
  { id: 'chat',     label: 'Chat',     desc: 'Multi-turn conversation with legal context' },
  { id: 'timeline', label: 'Timeline', desc: 'Read case event timeline' },
]

const STEPS = [
  { n: '1', text: 'Enter your API key below' },
  { n: '2', text: 'Select the scopes you want to grant' },
  { n: '3', text: 'Click Authorize — get a short-lived JWT (1h)' },
  { n: '4', text: 'Paste the token into your Claude MCP settings or Custom GPT action header' },
]

export default function ConnectPage() {
  const [apiKey, setApiKey]         = useState('')
  const [selectedScopes, setScopes] = useState(['search', 'ask', 'chat'])
  const [token, setToken]           = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [copied, setCopied]         = useState(false)

  function toggleScope(id: string) {
    setScopes(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function handleAuthorize() {
    if (!apiKey.trim()) return
    setError(''); setToken(''); setLoading(true)
    try {
      const r = await fetch(`${API}/auth/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, scopes: selectedScopes }),
      })
      if (!r.ok) {
        const e = await r.json()
        throw new Error(e.detail || 'Authorization failed')
      }
      const data = await r.json()
      setToken(data.access_token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authorization failed')
    } finally {
      setLoading(false)
    }
  }

  function copy() {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Nav active="connect" />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Connect an AI client</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            Issue a scoped JWT token to connect Claude, a Custom GPT, or any MCP-compatible client
            to this Legal Intelligence Platform.
          </p>
        </div>

        {/* How it works */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">How it works</p>
          </div>
          <div className="p-5 space-y-4">
            {STEPS.map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center shrink-0 font-medium">
                  {n}
                </span>
                <p className="text-sm text-gray-600 pt-0.5">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scope selection */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Requested scopes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SCOPES.map(({ id, label, desc }) => {
              const active = selectedScopes.includes(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleScope(id)}
                  className={`text-left border rounded-xl p-4 transition-all ${
                    active
                      ? 'border-emerald-200 bg-emerald-50/50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-semibold ${active ? 'text-gray-900' : 'text-gray-700'}`}>
                      {label}
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      active ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                    }`}>
                      {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* API key input */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-700">API key</label>
          <div className="flex gap-2 flex-col sm:flex-row">
            <input
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm placeholder:text-gray-400"
              placeholder="lrag-xxxxxxxxxxxx"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button
              onClick={handleAuthorize}
              disabled={loading || !apiKey.trim()}
              className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-6 py-3 text-sm font-medium transition-all disabled:opacity-50 shadow-sm flex items-center gap-2 justify-center"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authorizing
                </>
              ) : (
                <>Authorize <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Use <code className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-mono">lrag-demo</code> to try with the demo key.
          </p>
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Token output */}
        {token && (
          <div className="space-y-4 pt-2">
            <Separator className="bg-gray-100" />
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Access token</p>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1 font-medium">
                  Expires in 1h
                </span>
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-all bg-white shadow-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800">
              <p className="text-xs font-mono text-emerald-400 break-all leading-relaxed">{token}</p>
            </div>

            {/* MCP instructions */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">Using with Claude MCP</p>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Add this server to your Claude MCP config and set{' '}
                  <code className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-mono">MCP_DEFAULT_JWT</code> to the token above.
                  Claude can then call{' '}
                  <code className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-mono">search</code>,{' '}
                  <code className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-mono">ask</code>, and{' '}
                  <code className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded font-mono">chat</code> as native tools.
                </p>
                <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800">
                  <pre className="text-xs text-zinc-300 leading-relaxed overflow-x-auto">{`{
  "mcpServers": {
    "legal-rag": {
      "url": "${API}/mcp",
      "env": {
        "MCP_DEFAULT_JWT": "<paste token>"
      }
    }
  }
}`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
