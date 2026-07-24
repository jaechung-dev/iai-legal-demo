import fs from 'fs'
import path from 'path'
import Nav from '@/components/Nav'
import TimelineClient from '@/components/TimelineClient'

export type CaseEvent = {
  date: string
  category: string
  event_type: string
  subject: string
  summary: string
  content: string
  attachments: { name: string; type: string; pages?: number }[]
}

function loadEvents(): CaseEvent[] {
  const file = fs.readFileSync(
    path.join(process.cwd(), '..', 'cases', 'case_nguyen_v_r.jsonl'),
    'utf-8'
  )
  return file.trim().split('\n').map(l => JSON.parse(l))
}

export default function TimelinePage() {
  const events = loadEvents()
  return (
    <>
      <Nav active="timeline" />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Case Timeline</h1>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-semibold text-gray-700">R v Nguyen</span>
                <span className="mx-2 text-gray-300">·</span>
                NSW District Court 2025
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {events.length} events
            </div>
          </div>
        </div>
        <TimelineClient events={events} />
      </main>
    </>
  )
}
