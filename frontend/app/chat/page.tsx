'use client'

import { useState, useRef, useEffect } from 'react'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { MessageSquare, Send, BookOpen } from 'lucide-react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type Source = { citation: string; content: string; score: number; source_type: string }

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
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return
    setInput('')
    setLoading(true)
    setSources([])

    const history: ChatMessage[] = [...messages, { role: 'user', content: question }]
    setMessages([...history, { role: 'assistant', content: '' }])

    let answer = ''
    try {
      await fetchEventSource(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          k: 5,
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
    <div className="h-screen flex flex-col bg-slate-50">
      <Nav active="chat" />

      <div className="flex flex-1 min-h-0">

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-white">
          <ScrollArea className="flex-1 px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-6 h-6 text-indigo-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Ask about NSW law</h2>
                <p className="text-sm text-slate-400 leading-relaxed mb-8">
                  Plain English answers backed by real legislation and caselaw.
                  <br />A starting point — not legal advice.
                </p>
                <div className="w-full space-y-2 text-left">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-5">
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-slate-100 text-slate-800 rounded-bl-none'
                    }`}>
                      {m.content || (loading && i === messages.length - 1
                        ? <span className="animate-pulse text-slate-400">▌</span>
                        : null
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="border-t border-slate-100 px-6 py-4 bg-white">
            <div className="max-w-2xl mx-auto flex gap-3 items-center">
              <input
                className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-slate-50 focus:bg-white"
                placeholder="Ask a question about NSW law…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                disabled={loading}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                size="icon"
                className="rounded-xl w-11 h-11 bg-indigo-600 hover:bg-indigo-700 shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ── Sources panel ── */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col border-l border-slate-200 bg-slate-50">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Sources</p>
            {sources.length > 0 && (
              <span className="ml-auto text-xs text-slate-400">{sources.length}</span>
            )}
          </div>
          <ScrollArea className="flex-1 p-3">
            {sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                <BookOpen className="w-6 h-6 text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Retrieved legislation and caselaw will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <Card key={i} className="border-slate-200 shadow-none">
                    <CardHeader className="pb-2 pt-3 px-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700 leading-snug">{s.citation}</p>
                        <Badge
                          variant="secondary"
                          className={`text-xs shrink-0 ${
                            s.source_type === 'legislation'
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {s.source_type === 'legislation' ? 'Act' : 'Case'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{s.content}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-100 rounded-full">
                          <div className="h-1 bg-indigo-300 rounded-full" style={{ width: `${Math.round(s.score * 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{Math.round(s.score * 100)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

      </div>
    </div>
  )
}
