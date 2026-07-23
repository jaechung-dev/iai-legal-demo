'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaseEvent } from '@/app/page'

const CATEGORIES = ['All', 'Offence', 'Investigation', 'Police', 'Court', 'Submissions', 'Verdict']

const COLORS: Record<string, { badge: string; dot: string }> = {
  Offence:       { badge: 'bg-red-100 text-red-800',      dot: 'bg-red-400' },
  Investigation: { badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-400' },
  Police:        { badge: 'bg-blue-100 text-blue-800',    dot: 'bg-blue-400' },
  Court:         { badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-400' },
  Submissions:   { badge: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-400' },
  Verdict:       { badge: 'bg-green-100 text-green-800',  dot: 'bg-green-400' },
}
const DEFAULT = { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' }

export default function TimelineClient({ events }: { events: CaseEvent[] }) {
  const [selected, setSelected] = useState<CaseEvent | null>(null)
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All' ? events : events.filter(e => e.category === filter)

  return (
    <>
      {/* Category filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map(cat => {
          const count = cat === 'All' ? events.length : events.filter(e => e.category === cat).length
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
              {cat !== 'All' && <span className="ml-1 opacity-50">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Vertical timeline */}
      <div className="overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        {filtered.map((e, i) => {
          const c = COLORS[e.category] || DEFAULT
          const isFirst = i === 0
          const isLast = i === filtered.length - 1

          return (
            <div key={i} className="flex gap-4">
              {/* Track: line + dot + line */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div className={`w-px flex-none h-4 ${isFirst ? 'bg-transparent' : 'bg-slate-200'}`} />
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white ${c.dot}`} />
                <div className={`w-px flex-1 min-h-[36px] ${isLast ? 'bg-transparent' : 'bg-slate-200'}`} />
              </div>

              {/* Content */}
              <div
                data-testid="timeline-row"
                onClick={() => setSelected(e)}
                className="flex-1 pb-7 cursor-pointer group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-slate-400 tabular-nums">{e.date}</span>
                  <Badge className={`text-xs py-0 ${c.badge}`}>{e.category}</Badge>
                </div>
                <p className="text-sm font-medium text-slate-800 group-hover:text-slate-500 transition-colors leading-snug">
                  {e.subject}
                </p>
                {e.summary && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {e.summary}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              {selected && (
                <Badge className={(COLORS[selected.category] || DEFAULT).badge}>
                  {selected.category}
                </Badge>
              )}
              <span className="text-xs text-slate-400 tabular-nums">{selected?.date}</span>
            </div>
            <DialogTitle className="text-base leading-snug">{selected?.subject}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">{selected?.summary}</p>
          <ScrollArea className="flex-1 mt-2">
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {selected?.content}
              </p>
            </div>
            {selected?.attachments && selected.attachments.length > 0 && (
              <div className="mt-4 flex gap-2 flex-wrap">
                {selected.attachments.map((a, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {a.name}
                  </Badge>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
