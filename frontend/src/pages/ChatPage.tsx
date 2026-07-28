import { useState, useRef, useEffect } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { Scale, ChevronRight, SidebarOpen, PanelLeft } from 'lucide-react'
import Nav from '../components/Nav'
import LoginModal from '../components/LoginModal'
import ConversationSidebar from '../components/chat/ConversationSidebar'
import SourcesPanel from '../components/chat/SourcesPanel'
import ChatInput from '../components/chat/ChatInput'
import TypewriterText from '../components/chat/TypewriterText'
import { useGuestQuota } from '@/hooks/useGuestQuota'
import { useAuth } from '@/context/auth'
import { API_URL as API } from '@/lib/config'
import type { ChatMessage, ChatSource, ConvSummary } from '@/types/chat'

const SUGGESTED = [
  'What is a committal hearing?',
  'What does bail mean?',
  'What is the maximum sentence for fraud?',
  'What happens at sentencing?',
]

// Feedback while the model is retrieving + drafting, so a slow first token
// (e.g. a cold Lambda) doesn't look frozen.
function ThinkingIndicator({ searching }: { searching: boolean }) {
  return (
    <span className="flex items-center gap-2 text-gray-500">
      <span className="flex gap-1" aria-hidden="true">
        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </span>
      <span className="text-xs">{searching ? 'Searching NSW legislation & caselaw…' : 'Reading sources & drafting…'}</span>
    </span>
  )
}

export default function ChatPage() {
  const [messages, setMessages]         = useState<ChatMessage[]>([])
  const [sources, setSources]           = useState<ChatSource[]>([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [showSources, setShowSources]   = useState(false)
  const [caseId, setCaseId]             = useState<string | null>(null)
  const [caseMatter, setCaseMatter]     = useState<Record<string, string> | null>(null)
  const [showCaseBanner, setShowCaseBanner] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations]   = useState<ConvSummary[]>([])
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [deletingId, setDeletingId]     = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const { gate, showGate, dismissGate } = useGuestQuota()
  const { token } = useAuth()

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/user/case`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.case?.id) { setCaseId(data.case.id); setCaseMatter(data.case.matter ?? null); setShowCaseBanner(true) }
      }).catch(() => {})
  }, [token])

  // The case banner is a transient "now reading your case" confirmation —
  // auto-dismiss it after a few seconds so it doesn't linger forever.
  useEffect(() => {
    if (!showCaseBanner) return
    const t = setTimeout(() => setShowCaseBanner(false), 5000)
    return () => clearTimeout(t)
  }, [showCaseBanner])

  useEffect(() => { if (token) fetchConversations() }, [token])

  async function fetchConversations() {
    if (!token) return
    try {
      const r = await fetch(`${API}/conversations`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) setConversations(await r.json())
    } catch {}
  }

  function startNewChat() {
    setMessages([]); setSources([]); setConversationId(null)
  }

  async function loadConversation(id: string) {
    if (!token) return
    try {
      const r = await fetch(`${API}/conversations/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) return
      const data = await r.json()
      const msgs: ChatMessage[] = data.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role, content: m.content,
      }))
      const lastMsg = data.messages.findLast((m: { role: string; sources?: ChatSource[] }) => m.role === 'assistant' && m.sources)
      setMessages(msgs); setSources(lastMsg?.sources ?? []); setConversationId(id)
      if (data.case_id) setCaseId(data.case_id)
    } catch {}
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!token) return
    setDeletingId(id)
    try {
      await fetch(`${API}/conversations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (conversationId === id) startNewChat()
    } catch {}
    setDeletingId(null)
  }

  async function sendMessage(question: string) {
    if (!question.trim() || sendingRef.current) return
    sendingRef.current = true
    if (!gate()) { sendingRef.current = false; return }
    setInput(''); setLoading(true); setSources([])

    let convId = conversationId
    if (!convId && token) {
      try {
        const r = await fetch(`${API}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: question.slice(0, 60), case_id: caseId }),
        })
        if (r.ok) {
          const created: ConvSummary = await r.json()
          convId = created.id; setConversationId(convId)
          setConversations(prev => [created, ...prev])
        }
      } catch {}
    }

    setMessages([...messages, { role: 'user', content: question }, { role: 'assistant', content: '' }])

    let answer = ''; let finalSources: ChatSource[] = []; let completed = false; let streamOk = false
    const ctrl = new AbortController()
    try {
      const hdrs: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) hdrs['Authorization'] = `Bearer ${token}`
      await fetchEventSource(`${API}/chat`, {
        method: 'POST', headers: hdrs, signal: ctrl.signal, openWhenHidden: true,
        body: JSON.stringify({
          question, messages: messages.map(m => ({ role: m.role, content: m.content })),
          k: 5, ...(caseId ? { case_id: caseId } : {}),
        }),
        onmessage(ev) {
          if (ev.data === '[DONE]') { completed = true; ctrl.abort(); return }
          try {
            const evt = JSON.parse(ev.data)
            if (evt.type === 'sources') { finalSources = evt.docs; setSources(evt.docs) }
            else if (evt.type === 'token' && !completed) {
              answer += evt.text
              setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', content: answer }; return next })
            }
          } catch {}
        },
        onclose() { if (!completed) throw new Error('Stream closed unexpectedly') },
        onerror(err) { throw err },
      })
      streamOk = completed
    } catch (e) {
      if (completed || (e as Error)?.name === 'AbortError') { streamOk = true }
      else setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }; return next })
    } finally {
      setLoading(false); sendingRef.current = false
    }

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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {showGate && <LoginModal onClose={dismissGate} />}
      <Nav />

      {caseId && showCaseBanner && (
        <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="font-medium">
            Reading your case documents
            {caseMatter?.matterType ? ` · ${caseMatter.matterType}` : ''}
            {caseMatter?.subType ? ` · ${caseMatter.subType}` : ''}
          </span>
          <button onClick={() => setShowCaseBanner(false)} className="ml-auto text-rose-500 hover:text-rose-700">✕</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {token && (
          <ConversationSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            conversations={conversations}
            activeId={conversationId}
            deletingId={deletingId}
            onNew={startNewChat}
            onSelect={loadConversation}
            onDelete={deleteConversation}
          />
        )}

        <div className="flex flex-col flex-1 min-w-0 bg-white">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 lg:hidden">
            {token && (
              <button onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors p-1"
                aria-label="Open sidebar">
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            {sources.length > 0 && (
              <button onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-2 text-xs font-medium text-rose-700 ml-auto">
                <SidebarOpen className="w-3.5 h-3.5" />
                {showSources ? 'Hide' : 'Show'} {sources.length} sources
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg">
                  <Scale className="w-7 h-7 text-zinc-950" strokeWidth={2.5} />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Ask about NSW law</h2>
                <p className="text-sm text-gray-500 leading-relaxed mb-8">
                  Plain English answers backed by real legislation and caselaw.<br />A starting point — not legal advice.
                </p>
                <div className="w-full space-y-2 text-left">
                  {SUGGESTED.map(q => (
                    <button key={q} onClick={() => sendMessage(q)}
                      className="w-full text-sm bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-600 hover:bg-gray-50 hover:border-rose-200 hover:text-gray-900 transition-all text-left shadow-sm group flex items-center justify-between">
                      <span>{q}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-rose-400 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Scale className="w-4 h-4 text-zinc-950" strokeWidth={2.5} />
                      </div>
                    )}
                    <div className={`max-w-[82%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'bg-gray-900 text-white rounded-br-none'
                        : 'bg-gray-50 text-gray-800 rounded-bl-none border border-gray-100'
                    }`}>
                      {m.role === 'assistant'
                        ? (m.content
                            ? <TypewriterText text={m.content} active={loading && i === messages.length - 1} />
                            : (loading && i === messages.length - 1
                                ? <ThinkingIndicator searching={sources.length === 0} />
                                : null))
                        : m.content
                      }
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <ChatInput value={input} onChange={setInput} onSend={() => sendMessage(input)} disabled={loading} />
        </div>

        <SourcesPanel
          show={showSources}
          onHide={() => setShowSources(false)}
          sources={sources}
        />
      </div>
    </div>
  )
}
