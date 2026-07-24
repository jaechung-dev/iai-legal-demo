'use client'

import { useState } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { Search, MessageSquare, ChevronDown } from 'lucide-react'
import Nav from '@/components/Nav'
import { ScrollArea } from '@/components/ui/scroll-area'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

type SearchResult = {
  content: string
  metadata: { citation?: string; case_name?: string; score: number; source: string }
}
type Mode = 'search' | 'ask'
type Source = 'legislation' | 'caselaw' | 'both' | 'case_events'

const SOURCE_LABELS: Record<Source, string> = {
  legislation: 'Legislation',
  caselaw: 'Caselaw',
  both: 'All sources',
  case_events: 'Case Events',
}

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
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Search & Ask</h1>
          <p className="text-sm text-gray-500 mt-1">
            Search NSW legislation and caselaw, or ask a legal question in plain English
          </p>
        </div>

        {/* Mode + input */}
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {([
              { m: 'search' as Mode, Icon: Search,        label: 'Search' },
              { m: 'ask'    as Mode, Icon: MessageSquare, label: 'Ask'    },
            ]).map(({ m, Icon, label }) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResults([]); setAnswer(''); setError('') }}
                className={`flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === m
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Input row */}
          <div className="flex gap-2 flex-col sm:flex-row">
            <div className="relative flex-1">
              {mode === 'search'
                ? <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                : <MessageSquare className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              }
              <input
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white shadow-sm placeholder:text-gray-400"
                placeholder={mode === 'search' ? 'Search NSW legislation and caselaw…' : 'Ask a legal question…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (mode === 'search' ? doSearch() : doAsk())}
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <select
                  className="appearance-none border border-gray-200 rounded-xl pl-3 pr-8 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-700 shadow-sm cursor-pointer"
                  value={source}
                  onChange={e => setSource(e.target.value as Source)}
                >
                  <option value="legislation">Legislation</option>
                  <option value="caselaw">Caselaw</option>
                  <option value="both">Both</option>
                  <option value="case_events">Case Events</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <button
                onClick={mode === 'search' ? doSearch : doAsk}
                disabled={loading}
                className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-6 text-sm font-medium transition-all disabled:opacity-50 shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {mode === 'search' ? 'Searching' : 'Asking'}
                  </span>
                ) : (
                  mode === 'search' ? 'Search' : 'Ask'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Search results */}
        {mode === 'search' && results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 font-medium">
              {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
            </p>
            {results.map((r, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {r.metadata.citation || r.metadata.case_name || r.metadata.source}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-1.5 bg-emerald-400 rounded-full"
                        style={{ width: `${Math.round(r.metadata.score * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 tabular-nums">{Math.round(r.metadata.score * 100)}%</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{r.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ask streaming answer */}
        {mode === 'ask' && (answer || loading) && (
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <div className="w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Answer</p>
              {loading && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
                  <span className="w-3 h-3 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                  Generating
                </span>
              )}
            </div>
            <div className="px-5 py-5">
              <ScrollArea className="max-h-[60vh]">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {loading && <span className="animate-pulse text-emerald-400">▌</span>}
                </p>
              </ScrollArea>
            </div>
          </div>
        )}

      </main>
    </>
  )
}
