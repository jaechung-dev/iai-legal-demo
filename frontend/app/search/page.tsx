'use client'

import { useState, useRef } from 'react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.28:20000'

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
  const answerRef = useRef<HTMLDivElement>(null)

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    const r = await fetch(`${API}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, source, k: 8 }),
    })
    const d = await r.json()
    setResults(d.results)
    setLoading(false)
  }

  async function doAsk() {
    if (!query.trim()) return
    setLoading(true)
    setAnswer('')
    const r = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query, source, k: 6 }),
    })
    const reader = r.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const chunk = JSON.parse(line.slice(6))
            setAnswer(prev => prev + (chunk.text || ''))
            answerRef.current?.scrollTo(0, answerRef.current.scrollHeight)
          } catch {}
        }
      }
    }
    setLoading(false)
  }

  return (
    <>
      <Nav active="search" />
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Mode toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {(['search', 'ask'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setResults([]); setAnswer('') }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'search' ? '🔍 Search' : '💬 Ask'}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex gap-3">
          <input
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder={mode === 'search' ? 'Search NSW legislation and caselaw...' : 'Ask a legal question...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (mode === 'search' ? doSearch() : doAsk())}
          />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
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
          >
            {loading ? '...' : mode === 'search' ? 'Search' : 'Ask'}
          </Button>
        </div>

        {/* Search results */}
        {mode === 'search' && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">{results.length} results</p>
            {results.map((r, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">
                      {r.metadata.citation || r.metadata.case_name || r.metadata.source}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      score {r.metadata.score}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-700 leading-relaxed">{r.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Ask streaming answer */}
        {mode === 'ask' && (answer || loading) && (
          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Answer</p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[60vh]" ref={answerRef}>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {loading && <span className="animate-pulse text-slate-400">▌</span>}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

      </main>
    </>
  )
}
