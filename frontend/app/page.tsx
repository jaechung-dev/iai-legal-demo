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
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Case Timeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            <span className="font-medium text-slate-700">R v Nguyen</span>
            {' · '}NSW District Court 2025
            {' · '}{events.length} events
          </p>
        </div>
        <TimelineClient events={events} />
      </main>
    </>
  )
}
