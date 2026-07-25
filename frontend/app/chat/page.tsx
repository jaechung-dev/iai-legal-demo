'use client'

import { useState, useRef, useEffect } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { MessageSquare, Send, BookOpen, ChevronRight, X, SidebarOpen, FolderOpen } from 'lucide-react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import LoginModal from '@/components/LoginModal'
import { useGuestQuota } from '@/hooks/useGuestQuota'
import { API_URL as API } from '@/lib/config'
import { useAuth } from '@/context/auth'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type Source = { citation: string; content: string; score: number; source_type: string }
type UserCase = { id: string; matter: { type?: string; subtype?: string; [key: string]: unknown } | null; created_at: string }

const SUGGESTED = [
  'What is a committal hearing?',
  'What does bail mean?',
  'What is the maximum sentence for fraud?',
  'What happens at sentencing?',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [caseMatter, setCaseMatter] = useState<{ type?: string; subtype?: string } | null>(null)
  const [showCaseBanner, setShowCaseBanner] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { gate, showGate, dismissGate } = useGuestQuota()
  const { token, user } = useAuth()

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch the logged-in user's most recent case on mount / when token changes
  useEffect(() => {
    if (!token || !user) {
      setCaseId(null)
      setCaseMatter(null)
      return
    }
    fetch(`${API}/user/case`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.case) {
          setCaseId(data.case.id)
          setCaseMatter(data.case.matter ?? null)
          setShowCaseBanner(true)
        }
      })
      .catch(() => {})
  }, [token, user])

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return
    if (!gate()) return
    setInput('')
    setLoading(true)
    setSources([])

    const history: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])

    let answer = ''
    try {
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) authHeaders['Authorization'] = `Bearer ${token}`
      await fetchEventSource(`${API}/chat`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          question,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          k: 5,
          ...(caseId ? { case_id: caseId } : {}),
        }),
        onmessage(ev) {
          if (ev.data === '[DONE]') return
          try {
            const evt = JSON.parse(ev.data)
            if (evt.type === 'sources') {
              setSources(evt.docs)
            } else if (evt.type === 'token') {
              answer += evt.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: answer }
                return next
              })
            }
          } catch {}
        },
        onclose() {},
        onerror(err) { throw err },
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {showGate && <LoginModal onClose={dismissGate} />}
      <Nav />

      {/* Case context banner */}
      {caseId && showCaseBanner && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-emerald-800 text-xs">
          <FolderOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-medium">
            Analysing your case
            {caseMatter?.type ? `: ${caseMatter.type}` : ''}
            {caseMatter?.subtype ? ` · ${caseMatter.subtype}` : ''}
          </span>
          <button
            onClick={() => setShowCaseBanner(false)}
            className="ml-auto text-emerald-500 hover:text-emerald-700 p-0.5"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-white">
          {/* Mobile sources toggle */}
          {sources.length > 0 && (
            <div className="lg:hidden flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100">
              <button
                onClick={() => setShowSources(!showSources)}
                className="flex items-center gap-2 text-xs font-medium text-emerald-700"
              >
                <SidebarOpen className="w-3.5 h-3.5" />
                {showSources ? 'Hide' : 'Show'} {sources.length} sources
              </button>
            </div>
          )}

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
                      {m.content || (loading && i === messages.length - 1
                        ? <span className="animate-pulse text-gray-400">▌</span>
                        : null
                      )}
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
          <ScrollArea className="flex-1 p-3">
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
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
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
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-2">{s.content}</p>
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
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

      </div>
    </div>
  )
}
