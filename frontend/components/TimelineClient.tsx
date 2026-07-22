'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaseEvent } from '@/app/page'

const CATEGORY_COLORS: Record<string, string> = {
  Offence:       'bg-red-100 text-red-800 hover:bg-red-100',
  Investigation: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  Police:        'bg-blue-100 text-blue-800 hover:bg-blue-100',
  Court:         'bg-purple-100 text-purple-800 hover:bg-purple-100',
  Submissions:   'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  Verdict:       'bg-green-100 text-green-800 hover:bg-green-100',
}

export default function TimelineClient({ events }: { events: CaseEvent[] }) {
  const [selected, setSelected] = useState<CaseEvent | null>(null)

  return (
    <>
      <div className="space-y-2">
        {events.map((e, i) => (
          <Card
            key={i}
            onClick={() => setSelected(e)}
            className="cursor-pointer hover:border-slate-400 hover:shadow-sm transition-all"
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-24 shrink-0">{e.date}</span>
                <Badge className={`text-xs shrink-0 ${CATEGORY_COLORS[e.category] || 'bg-slate-100 text-slate-700'}`}>
                  {e.category}
                </Badge>
                <span className="text-sm text-slate-800 truncate">{e.subject}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-28 line-clamp-1">{e.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              {selected && (
                <Badge className={CATEGORY_COLORS[selected.category] || 'bg-slate-100 text-slate-700'}>
                  {selected.category}
                </Badge>
              )}
              <span className="text-xs text-slate-400">{selected?.date}</span>
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
                {selected.attachments.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    📎 {a.name}
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
