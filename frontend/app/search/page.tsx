'use client'

import { useState } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { Search, MessageSquare } from 'lucide-react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

type SearchResult = {
  content: string
  metadata: { citation?: string; case_name?: string; score: number; source: string }
}
type Mode = 'search' | 'ask'
type Source = 'legislation' | 'caselaw' | 'both' | 'case_events'

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<Source>('legislation')
  const [results, setResults] = useState<SearchResult[]>([])
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    setError('')
    try {
      const r = await fetch(`${API}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, source, k: 8 }),
      })
      if (!r.ok) throw new Error(`Server error ${r.status}`)
      const d = await r.json()
      setResults(d.results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the API — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  async function doAsk() {
    if (!query.trim()) return
    setLoading(true)
    setAnswer('')
    setError('')
    try {
      await fetchEventSource(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, source, k: 6 }),
        onmessage(ev) {
          if (ev.data === '[DONE]') return
          try {
            const chunk = JSON.parse(ev.data)
            if (chunk.text) setAnswer(prev => prev + chunk.text)
          } catch {}
        },
        onclose() {},
        onerror(err) { throw err },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the API — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Nav active="search" />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900">Search & Ask</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Search through NSW legislation and caselaw, or ask a legal question
          </p>
        </div>

        {/* Mode + input */}
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {([
              { m: 'search' as Mode, Icon: Search,        label: 'Search' },
              { m: 'ask'    as Mode, Icon: MessageSquare, label: 'Ask'    },
            ]).map(({ m, Icon, label }) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResults([]); setAnswer(''); setError('') }}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              {mode === 'search'
                ? <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                : <MessageSquare className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              }
              <input
                className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white"
                placeholder={mode === 'search' ? 'Search NSW legislation and caselaw…' : 'Ask a legal question…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (mode === 'search' ? doSearch() : doAsk())}
              />
            </div>
            <select
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700"
              value={source}
              onChange={e => setSource(e.target.value as Source)}
            >
              <option value="legislation">Legislation</option>
              <option value="caselaw">Caselaw</option>
              <option value="both">Both</option>
              <option value="case_events">Case Events</option>
            </select>
            <Button
              onClick={mode === 'search' ? doSearch : doAsk}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-5"
            >
              {loading ? '…' : mode === 'search' ? 'Search' : 'Ask'}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Search results */}
        {mode === 'search' && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">{results.length} results</p>
            {results.map((r, i) => (
              <Card key={i} className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {r.metadata.citation || r.metadata.case_name || r.metadata.source}
                    </p>
                    <Badge variant="secondary" className="text-xs shrink-0 bg-slate-100 text-slate-500">
                      {Math.round(r.metadata.score * 100)}% match
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <p className="text-sm text-slate-600 leading-relaxed">{r.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Ask streaming answer */}
        {mode === 'ask' && (answer || loading) && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Answer</p>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ScrollArea className="max-h-[60vh]">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {loading && <span className="animate-pulse text-indigo-400">▌</span>}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

      </main>
    </>
  )
}
