'use client'

import { useState } from 'react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.28:20000'

const SCOPES = [
  { id: 'search',   label: 'Search',   desc: 'Semantic search over NSW legislation and caselaw' },
  { id: 'ask',      label: 'Ask',      desc: 'RAG-powered Q&A with source citations' },
  { id: 'chat',     label: 'Chat',     desc: 'Multi-turn conversation with legal context' },
  { id: 'timeline', label: 'Timeline', desc: 'Read case event timeline' },
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
      <Nav active="search" />
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <div>
          <h2 className="text-xl font-bold text-slate-900">Connect an AI client</h2>
          <p className="text-sm text-slate-500 mt-1">
            Issue a scoped JWT token to connect Claude, a Custom GPT, or any MCP-compatible client
            to this Legal Intelligence Platform.
          </p>
        </div>

        {/* How it works */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { step: '1', text: 'Enter your API key below' },
              { step: '2', text: 'Select the scopes you want to grant' },
              { step: '3', text: 'Click Authorize — get a short-lived JWT (1h)' },
              { step: '4', text: 'Paste the token into your Claude MCP settings or Custom GPT action header' },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {step}
                </span>
                <p className="text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Scope selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Requested scopes</p>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => toggleScope(id)}
                className={`text-left border rounded-xl p-3 transition-all ${
                  selectedScopes.includes(id)
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-800">{label}</span>
                  {selectedScopes.includes(id) && (
                    <span className="text-xs text-green-600 font-medium">✓</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-snug">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* API key input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">API key</label>
          <div className="flex gap-3">
            <input
              className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="lrag-xxxxxxxxxxxx"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <Button onClick={handleAuthorize} disabled={loading || !apiKey.trim()}>
              {loading ? 'Authorizing…' : 'Authorize'}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Use <code className="bg-slate-100 px-1 rounded">lrag-demo</code> to try with the demo key.
          </p>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Token output */}
        {token && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Access token</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs bg-green-50 text-green-700">
                    Expires in 1h
                  </Badge>
                  <Button variant="outline" size="sm" onClick={copy}>
                    {copied ? '✓ Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-4">
                <p className="text-xs font-mono text-green-400 break-all leading-relaxed">{token}</p>
              </div>
              <Card className="border-blue-100 bg-blue-50">
                <CardContent className="pt-4 pb-4 space-y-2">
                  <p className="text-xs font-semibold text-blue-800">Using with Claude MCP</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Add this server to your Claude MCP config and set{' '}
                    <code className="bg-blue-100 px-1 rounded">MCP_DEFAULT_JWT</code> to the token above.
                    Claude can then call <code className="bg-blue-100 px-1 rounded">search</code>,{' '}
                    <code className="bg-blue-100 px-1 rounded">ask</code>, and{' '}
                    <code className="bg-blue-100 px-1 rounded">chat</code> as native tools.
                  </p>
                  <div className="bg-blue-900 rounded-lg p-3 mt-2">
                    <pre className="text-xs text-blue-200 leading-relaxed">{`{
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
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  )
}
