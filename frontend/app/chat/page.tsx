'use client'

import { useState, useRef, useEffect } from 'react'
import Nav from '@/components/Nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.28:20000'

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

    try {
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          k: 5,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)

      const reader = r.body!.getReader()
      const dec = new TextDecoder()
      let answer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
          try {
            const evt = JSON.parse(line.slice(6))
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
        }
      }
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
    <div className="h-screen flex flex-col">
      <Nav active="chat" />

      <div className="flex flex-1 min-h-0">

        {/* ── Chat panel ── */}
        <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-slate-200">
          <ScrollArea className="flex-1 px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-6 pt-4 max-w-lg">
                <div>
                  <p className="text-slate-800 font-semibold text-base mb-1">
                    Ask anything about NSW law
                  </p>
                  <p className="text-slate-400 text-sm">
                    Plain English answers backed by real legislation and caselaw
                  </p>
                </div>
                <div className="grid gap-2">
                  {SUGGESTED.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-sm bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-slate-900 text-white rounded-br-none'
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

          <Separator />
          <div className="px-6 py-4">
            <div className="flex gap-3 items-center">
              <input
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition-all"
                placeholder="Ask a question about NSW law..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                disabled={loading}
              />
              <Button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                size="icon"
                className="rounded-xl w-10 h-10 shrink-0"
              >
                ↑
              </Button>
            </div>
          </div>
        </div>

        {/* ── RAG sources panel ── */}
        <div className="w-80 xl:w-96 shrink-0 flex flex-col bg-slate-50 border-l border-slate-200">
          <div className="px-5 py-4 bg-white border-b border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Retrieved Context
            </p>
            {sources.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {sources.length} sources · NSW legislation + caselaw
              </p>
            )}
          </div>
          <ScrollArea className="flex-1 px-4 py-4">
            {sources.length === 0 ? (
              <p className="text-xs text-slate-400 text-center mt-12 leading-relaxed">
                The legislation and caselaw<br />retrieved for each answer<br />will appear here
              </p>
            ) : (
              <div className="space-y-3">
                {sources.map((s, i) => (
                  <Card key={i} className="border-slate-200">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700 leading-snug">{s.citation}</p>
                        <Badge
                          variant="secondary"
                          className={`text-xs shrink-0 ${
                            s.source_type === 'legislation'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {s.source_type === 'legislation' ? 'Act' : 'Case'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-4">{s.content}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-100 rounded-full">
                          <div
                            className="h-1 bg-slate-400 rounded-full"
                            style={{ width: `${Math.round(s.score * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-300">{Math.round(s.score * 100)}%</span>
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
