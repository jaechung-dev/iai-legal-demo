import Spinner from '@/components/Spinner'
import { Card, Row } from './CaseCard'
import type { CaseDetail } from '@/types/case'

const MATTER_LABELS: Record<string, string> = {
  criminal: 'Criminal', family: 'Family', civil: 'Civil',
  housing: 'Housing', employment: 'Employment', debt: 'Debt',
  consumer: 'Consumer', other: 'Other',
}

const URGENCY_LABELS: Record<string, string> = {
  court: 'Court date approaching',
  urgent: 'Urgent — within 2 weeks',
  normal: 'When possible',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SummarySection({ detail }: { detail: CaseDetail | null }) {
  if (!detail) return <Spinner />
  const { personal: p, matter: m, files, created_at } = detail
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Case Summary</h2>
        <p className="text-sm text-gray-500 mt-0.5">Submitted {fmtDate(created_at)}</p>
      </div>
      <Card title="Legal Matter">
        <Row label="Area of law" value={MATTER_LABELS[m.matterType ?? ''] ?? m.matterType} />
        {m.subType && <Row label="Issue" value={m.subType} />}
        <Row label="Urgency" value={URGENCY_LABELS[m.urgency ?? ''] ?? m.urgency} />
        {m.courtDate && <Row label="Court date" value={m.courtDate} />}
        {m.courtRef && <Row label="Court ref." value={m.courtRef} />}
        {m.description && <Row label="Description" value={m.description} multiline />}
        {m.outcome && <Row label="Desired outcome" value={m.outcome} multiline />}
      </Card>
      <Card title="Personal Details">
        <Row label="Name" value={p.name} />
        <Row label="Date of birth" value={p.dob} />
        <Row label="Phone" value={p.phone} />
        {p.suburb && <Row label="Location" value={[p.suburb, p.state, p.postcode].filter(Boolean).join(', ')} />}
        <Row label="Preferred contact" value={p.contact} />
      </Card>
      <Card title={`Documents (${files.length})`}>
        {files.length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded.</p>
        ) : (
          files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-3.5 h-3.5 text-gray-400 shrink-0">📎</span>
              <span className="text-gray-700 truncate">{f.name}</span>
              <span className="text-xs text-gray-400 shrink-0">· {f.category}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
