'use client'

import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import {
  MessageSquare, Send, BookOpen, ChevronRight, X, SidebarOpen,
  Plus, Trash2, PanelLeft,
} from 'lucide-react'
import { VariableSizeList as VList, ListChildComponentProps } from 'react-window'
import AutoSizer, { Size } from 'react-virtualized-auto-sizer'
import Nav from '@/components/Nav'
import { ScrollArea } from '@/components/ui/scroll-area'
import LoginModal from '@/components/LoginModal'
import { useGuestQuota } from '@/hooks/useGuestQuota'
import { useAuth } from '@/context/auth'
import { API_URL as API } from '@/lib/config'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type Source = { citation: string; content: string; score: number; source_type: string }
type ConvSummary = { id: string; title: string; updated_at: string; case_id: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function loadSession<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}

// ── TypewriterText ────────────────────────────────────────────────────────────

function TypewriterText({ text, active }: { text: string; active: boolean }) {
  const [displayed, setDisplayed] = useState(() => active ? '' : text)
  useEffect(() => {
    if (!text || displayed.length >= text.length) return
    const t = setTimeout(
      () => setDisplayed(text.slice(0, displayed.length + 2)),
      10,
    )
    return () => clearTimeout(t)
  }, [text, displayed])
  if (!displayed) return active ? <span className="animate-pulse text-gray-400">▌</span> : null
  return <>{displayed}</>
}

// ── Source card (virtualized row) ─────────────────────────────────────────────
// IntersectionObserver reveals full content once the card enters the viewport.
// ResizeObserver reports height changes back to the VList so it can recompute
// row sizes — this is how VariableSizeList handles dynamic heights correctly.

type SourceCardProps = {
  source: Source
  onResize: (h: number) => void
}

const SourceCard = memo(function SourceCard({ source: s, onResize }: SourceCardProps) {
  // Cards are always visible with a 3-line preview. IO fires once the card enters
  // the viewport and expands to full content — no empty frame ever shown.
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setExpanded(true); io.disconnect() } },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Report height to VList after expand so it can recompute row offsets
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => { onResize(el.offsetHeight + 8) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [onResize])

  return (
    <div ref={ref} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-700 leading-snug">{s.citation}</p>
        <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium ${
          s.source_type === 'legislation'
            ? 'bg-emerald-50 text-emerald-600'
            : 'bg-violet-50 text-violet-600'
        }`}>
          {s.source_type === 'legislation' ? 'Act' : 'Case'}
        </span>
      </div>
      {/* 3-line preview always readable; full text revealed when card enters viewport */}
      <p className={`text-xs text-gray-500 leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-3'}`}>
        {s.content}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-1 bg-emerald-400 rounded-full transition-all"
            style={{ width: `${Math.round(s.score * 100)}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{Math.round(s.score * 100)}%</span>
      </div>
    </div>
  )
})

// ── Virtualized row wrapper (react-window needs this shape) ───────────────────

type RowData = { sources: Source[]; onResize: (i: number, h: number) => void }

function SourceRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const handleResize = useCallback(
    (h: number) => data.onResize(index, h),
    [data, index],
  )
  return (
    <div style={style}>
      <div className="px-3 pb-2">
        <SourceCard source={data.sources[index]} onResize={handleResize} />
      </div>
    </div>
  )
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTED = [
  'What is a committal hearing?',
  'What does bail mean?',
  'What is the maximum sentence for fraud?',
  'What happens at sentencing?',
]

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadSession('chat_messages', []))
  const [sources, setSources] = useState<Source[]>(() => loadSession('chat_sources', []))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [caseMatter, setCaseMatter] = useState<Record<string, string> | null>(null)
  const [showCaseBanner, setShowCaseBanner] = useState(false)

  // Conversation history state
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Virtualized source list
  const vlistRef = useRef<VList<RowData>>(null)
  const itemSizes = useRef<number[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const { gate, showGate, dismissGate } = useGuestQuota()
  const { token } = useAuth()

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    if (messages.length > 0 && !loading) {
      try { sessionStorage.setItem('chat_messages', JSON.stringify(messages)) } catch {}
    }
  }, [messages, loading])

  useEffect(() => {
    if (sources.length > 0) {
      try { sessionStorage.setItem('chat_sources', JSON.stringify(sources)) } catch {}
    }
  }, [sources])

  // ── Load user case ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    fetch(`${API}/user/case`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.case?.id) {
          setCaseId(data.case.id)
          setCaseMatter(data.case.matter ?? null)
          setShowCaseBanner(true)
        }
      })
      .catch(() => {})
  }, [token])

  // ── Load conversation list ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    fetchConversations()
  }, [token])

  async function fetchConversations() {
    if (!token) return
    try {
      const r = await fetch(`${API}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) {
        const data: ConvSummary[] = await r.json()
        setConversations(data)
      }
    } catch {}
  }

  // ── Start new chat ──────────────────────────────────────────────────────────
  function startNewChat() {
    setMessages([])
    setSources([])
    setConversationId(null)
    try {
      sessionStorage.removeItem('chat_messages')
      sessionStorage.removeItem('chat_sources')
    } catch {}
  }

  // ── Load conversation ───────────────────────────────────────────────────────
  async function loadConversation(id: string) {
    if (!token) return
    try {
      const r = await fetch(`${API}/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) return
      const data = await r.json()
      const msgs: ChatMessage[] = data.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role,
        content: m.content,
      }))
      // Restore sources from last assistant message
      const lastMsg = data.messages.findLast((m: { role: string; sources?: Source[] }) => m.role === 'assistant' && m.sources)
      setMessages(msgs)
      setSources(lastMsg?.sources ?? [])
      setConversationId(id)
      if (data.case_id) setCaseId(data.case_id)
    } catch {}
  }

  // ── Delete conversation ─────────────────────────────────────────────────────
  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!token) return
    setDeletingId(id)
    try {
      await fetch(`${API}/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (conversationId === id) startNewChat()
    } catch {}
    setDeletingId(null)
  }

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage(question: string) {
    if (!question.trim() || sendingRef.current) return
    sendingRef.current = true
    if (!gate()) { sendingRef.current = false; return }
    setInput('')
    setLoading(true)
    setSources([])
    itemSizes.current = []

    // Create conversation on first message (logged-in users only)
    let convId = conversationId
    if (!convId && token) {
      try {
        const r = await fetch(`${API}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: question.slice(0, 60),
            case_id: caseId,
          }),
        })
        if (r.ok) {
          const created: ConvSummary = await r.json()
          convId = created.id
          setConversationId(convId)
          setConversations(prev => [created, ...prev])
        }
      } catch {}
    }

    const history: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])

    let answer = ''
    let finalSources: Source[] = []
    let completed = false
    let streamOk = false
    const ctrl = new AbortController()
    try {
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) hdrs['Authorization'] = `Bearer ${token}`
      await fetchEventSource(`${API}/chat`, {
        method: 'POST',
        headers: hdrs,
        signal: ctrl.signal,
        openWhenHidden: true,
        body: JSON.stringify({
          question,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          k: 5,
          ...(caseId ? { case_id: caseId } : {}),
        }),
        onmessage(ev) {
          if (ev.data === '[DONE]') {
            completed = true
            ctrl.abort()
            return
          }
          try {
            const evt = JSON.parse(ev.data)
            if (evt.type === 'sources') {
              finalSources = evt.docs
              setSources(evt.docs)
            } else if (evt.type === 'token' && !completed) {
              answer += evt.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: answer }
                return next
              })
            }
          } catch {}
        },
        onclose() { if (!completed) throw new Error('Stream closed unexpectedly') },
        onerror(err) { throw err },
      })
      // fetchEventSource resolved cleanly (abort-after-done path)
      streamOk = completed
    } catch (e) {
      if (completed || (e as Error)?.name === 'AbortError') {
        streamOk = true
      } else {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }
          return next
        })
      }
    } finally {
      setLoading(false)
      sendingRef.current = false
    }

    // Persist messages after stream completes (outside finally so setLoading fires first)
    if (streamOk && convId && token && answer) {
      try {
        await fetch(`${API}/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify([
            { role: 'user', content: question },
            { role: 'assistant', content: answer, sources: finalSources.length ? finalSources : null },
          ]),
        })
        fetchConversations()
      } catch {}
    }
  }

  // ── Source list height management ──────────────────────────────────────────
  const handleSourceResize = useCallback((index: number, height: number) => {
    if (itemSizes.current[index] === height) return
    itemSizes.current[index] = height
    vlistRef.current?.resetAfterIndex(index, false)
  }, [])

  const getSourceItemSize = useCallback(
    (index: number) => itemSizes.current[index] ?? 108,
    [],
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {showGate && <LoginModal onClose={dismissGate} />}
      <Nav />
      {caseId && showCaseBanner && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs text-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="font-medium">
            Reading your case documents
            {caseMatter?.matterType ? ` · ${caseMatter.matterType}` : ''}
            {caseMatter?.subType ? ` · ${caseMatter.subType}` : ''}
          </span>
          <button onClick={() => setShowCaseBanner(false)} className="ml-auto text-emerald-500 hover:text-emerald-700">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative overflow-hidden">

        {/* ── Conversation Sidebar (logged-in only) ── */}
        {token && (
          <>
            {/* Mobile overlay backdrop */}
            {sidebarOpen && (
              <div
                className="lg:hidden fixed inset-0 bg-black/40 z-20"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <aside className={`
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
              lg:translate-x-0
              fixed lg:relative z-30 lg:z-auto
              top-0 left-0 h-full lg:h-auto
              w-[260px] shrink-0
              flex flex-col
              bg-zinc-950 border-r border-zinc-800
              transition-transform duration-200 ease-in-out
            `}>
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-3 pt-4 pb-3 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Conversations</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden text-zinc-500 hover:text-zinc-300 p-1 rounded"
                  aria-label="Close sidebar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* New chat button */}
              <div className="px-3 py-3 border-b border-zinc-800">
                <button
                  onClick={() => { startNewChat(); setSidebarOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  New chat
                </button>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto py-2">
                {conversations.length === 0 ? (
                  <p className="text-xs text-zinc-600 text-center px-4 py-8 leading-relaxed">
                    Your conversations will appear here
                  </p>
                ) : (
                  <ul>
                    {conversations.map(conv => (
                      <li key={conv.id}>
                        <button
                          onClick={() => { loadConversation(conv.id); setSidebarOpen(false) }}
                          className={`w-full text-left px-3 py-2.5 group flex items-start gap-2 transition-colors ${
                            conversationId === conv.id
                              ? 'bg-zinc-800 text-white'
                              : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate leading-snug">
                              {conv.title.length > 42 ? conv.title.slice(0, 42) + '…' : conv.title}
                            </p>
                            <p className="text-zinc-600 text-xs mt-0.5">{relativeDate(conv.updated_at)}</p>
                          </div>
                          <button
                            onClick={(e) => deleteConversation(conv.id, e)}
                            disabled={deletingId === conv.id}
                            className={`shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 ${
                              conversationId === conv.id
                                ? 'text-zinc-400 hover:text-red-400'
                                : 'text-zinc-600 hover:text-red-400'
                            } disabled:opacity-30`}
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </>
        )}

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-white">
          {/* Mobile header row: sidebar toggle + sources toggle */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 lg:hidden">
            {token && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors p-1"
                aria-label="Open sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            {sources.length > 0 && (
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-2 text-xs font-medium text-emerald-700 ml-auto"
              >
                <SidebarOpen className="w-3.5 h-3.5" />
                {showSources ? 'Hide' : 'Show'} {sources.length} sources
              </button>
            )}
          </div>

          <ScrollArea className="flex-1 px-4 sm:px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center">
                <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center mb-5 shadow-lg">
                  <MessageSquare className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Ask about NSW law</h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-8">
                  Plain English answers backed by real legislation and caselaw.
                  <br />A starting point — not legal advice.
                </p>
                <div className="w-full space-y-2 text-left">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="w-full text-sm bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-600 hover:bg-gray-50 hover:border-emerald-200 hover:text-gray-900 transition-all text-left shadow-sm group flex items-center justify-between"
                    >
                      <span>{q}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-400 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                      </div>
                    )}
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'bg-gray-900 text-white rounded-br-none'
                        : 'bg-gray-50 text-gray-800 rounded-bl-none border border-gray-100'
                    }`}>
                      {m.role === 'assistant'
                        ? <TypewriterText text={m.content} active={loading && i === messages.length - 1} />
                        : m.content
                      }
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-gray-100 px-4 sm:px-6 py-4 bg-white">
            <div className="max-w-2xl mx-auto flex gap-3 items-center">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-gray-50 focus:bg-white placeholder:text-gray-400 shadow-sm"
                placeholder="Ask a question about NSW law…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="rounded-xl w-11 h-11 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shrink-0 transition-all shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Sources panel ── */}
        <div className={`
          ${showSources ? 'flex' : 'hidden'} lg:flex
          w-full lg:w-72 xl:w-80 shrink-0 flex-col
          absolute lg:relative inset-0 lg:inset-auto
          bg-white lg:bg-gray-50 border-l border-gray-100 z-10 lg:z-auto
        `}>
          <div className="px-4 py-3.5 border-b border-gray-100 bg-white flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Sources</p>
            {sources.length > 0 && (
              <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                {sources.length}
              </span>
            )}
            <button
              onClick={() => setShowSources(false)}
              className="lg:hidden ml-1 text-gray-400 hover:text-gray-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center px-4">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Retrieved legislation and caselaw will appear here
              </p>
            </div>
          ) : (
            // AutoSizer fills the available flex space; VList only renders
            // DOM nodes for visible rows. IntersectionObserver inside each
            // SourceCard triggers the content reveal on scroll entry.
            <div className="flex-1 min-h-0">
              <AutoSizer>
                {({ height, width }) => (
                  <VList<RowData>
                    ref={vlistRef}
                    height={height}
                    width={width}
                    itemCount={sources.length}
                    itemSize={getSourceItemSize}
                    itemData={{ sources, onResize: handleSourceResize }}
                    overscanCount={3}
                  >
                    {SourceRow}
                  </VList>
                )}
              </AutoSizer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
