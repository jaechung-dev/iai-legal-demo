'use client'

import { useState, useRef, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.28:20000'

type Event = {
  date: string
  category: string
  event_type: string
  subject: string
  summary: string
  content: string
  attachments: { name: string; type: string }[]
}

type SearchResult = {
  content: string
  metadata: { citation?: string; case_name?: string; score: number; source: string }
}

const CATEGORY_COLORS: Record<string, string> = {
  Offence:       'bg-red-100 text-red-800',
  Investigation: 'bg-orange-100 text-orange-800',
  Police:        'bg-blue-100 text-blue-800',
  Court:         'bg-purple-100 text-purple-800',
  Submissions:   'bg-yellow-100 text-yellow-800',
  Verdict:       'bg-green-100 text-green-800',
}

export default function Home() {
  const [tab, setTab] = useState<'timeline' | 'search' | 'ask'>('timeline')
  const [events, setEvents] = useState<Event[]>([])
  const [selected, setSelected] = useState<Event | null>(null)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('legislation')
  const [results, setResults] = useState<SearchResult[]>([])
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/case/nguyen/timeline`)
      .then(r => r.json())
      .then(d => setEvents(d.events))
  }, [])

  useEffect(() => {
    if (answerRef.current) answerRef.current.scrollTop = answerRef.current.scrollHeight
  }, [answer])

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    const r = await fetch(`${API}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, source, k: 5 }),
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
      body: JSON.stringify({ question: query, source, k: 4 }),
    })
    const reader = r.body!.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = dec.decode(value).split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const chunk = JSON.parse(line.slice(6))
            setAnswer(prev => prev + (chunk.text || ''))
          } catch {}
        }
      }
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Legal Intelligence Platform</h1>
          <p className="text-slate-400 text-sm">NSW Law · Semantic Search · RAG</p>
        </div>
        <span className="text-xs bg-slate-700 px-3 py-1 rounded-full">Demo · R v Nguyen [2025]</span>
      </header>

      {/* Tabs */}
      <div className="border-b bg-white px-6 flex gap-1">
        {(['timeline', 'search', 'ask'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'timeline' ? '📋 Case Timeline' : t === 'search' ? '🔍 Law Search' : '💬 Ask the Law'}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── TIMELINE ── */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-4">{events.length} events · R v Nguyen · NSW District Court 2025</p>
            {events.map((e, i) => (
              <div
                key={i}
                onClick={() => setSelected(e)}
                className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-slate-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs text-slate-400 w-24 shrink-0">{e.date}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-700'}`}>
                      {e.category}
                    </span>
                    <span className="text-sm text-slate-800 truncate">{e.subject}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1 ml-28 line-clamp-1">{e.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── SEARCH / ASK ── */}
        {(tab === 'search' || tab === 'ask') && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                placeholder={tab === 'search' ? 'Search NSW legislation and caselaw...' : 'Ask a legal question...'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (tab === 'search' ? doSearch() : doAsk())}
              />
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                value={source}
                onChange={e => setSource(e.target.value)}
              >
                <option value="legislation">Legislation</option>
                <option value="caselaw">Caselaw</option>
                <option value="both">Both</option>
                <option value="case_events">Case Events</option>
              </select>
              <button
                onClick={tab === 'search' ? doSearch : doAsk}
                disabled={loading}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : tab === 'search' ? 'Search' : 'Ask'}
              </button>
            </div>

            {/* Search results */}
            {tab === 'search' && results.length > 0 && (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-600">
                        {r.metadata.citation || r.metadata.case_name || r.metadata.source}
                      </span>
                      <span className="text-xs text-slate-400">score {r.metadata.score}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{r.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Ask streaming answer */}
            {tab === 'ask' && (answer || loading) && (
              <div ref={answerRef} className="bg-white border border-slate-200 rounded-lg p-5 max-h-96 overflow-y-auto">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {answer}
                  {loading && <span className="animate-pulse">▌</span>}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[selected.category] || 'bg-slate-100 text-slate-700'}`}>
                {selected.category}
              </span>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-1">{selected.date}</p>
            <h2 className="text-base font-semibold text-slate-900 mb-3">{selected.subject}</h2>
            <p className="text-sm text-slate-600 mb-4">{selected.summary}</p>
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
            </div>
            {selected.attachments?.length > 0 && (
              <div className="mt-4 flex gap-2 flex-wrap">
                {selected.attachments.map((a, i) => (
                  <span key={i} className="text-xs bg-slate-100 px-3 py-1 rounded-full text-slate-600">📎 {a.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
