import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, Trash2 } from 'lucide-react'
import { API_URL as API } from '@/lib/config'
import type { CaseSummary } from '@/types/case'

const MATTER_LABELS: Record<string, string> = {
  criminal: 'Criminal', family: 'Family', civil: 'Civil',
  housing: 'Housing', employment: 'Employment', debt: 'Debt',
  consumer: 'Consumer', other: 'Other',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  cases: CaseSummary[]
  activeCaseId: string
  token: string | null
  onActivate: (id: string) => void
  onDeleted: (id: string) => void
}

export default function CasesSection({ cases, activeCaseId, token, onActivate, onDeleted }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Delete this case and all its data? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`${API}/case/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      onDeleted(id)
    } catch {}
    setDeletingId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Manage Cases</h2>
        <Link to="/intake?step=2"
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-sm">
          <Plus className="w-4 h-4" /> New case
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
          <p className="text-sm text-gray-400 mb-3">No cases submitted yet.</p>
          <Link to="/intake?step=2" className="text-sm text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 justify-center">
            Submit your first case <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => {
            const active = c.id === activeCaseId
            return (
              <div key={c.id} className={`flex items-center gap-4 p-4 bg-white rounded-xl border shadow-sm transition-all ${
                active ? 'border-rose-200 ring-1 ring-rose-200/50' : 'border-gray-100 hover:border-gray-200'
              }`}>
                <button onClick={() => onActivate(c.id)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      {MATTER_LABELS[c.matter?.matterType ?? ''] ?? c.matter?.matterType ?? 'Case'}
                    </span>
                    {c.matter?.subType && <span className="text-xs text-gray-400">· {c.matter.subType}</span>}
                    {active && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(c.created_at)} · {c.file_count} document{c.file_count !== 1 ? 's' : ''}
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={deletingId === c.id}
                  className="text-gray-300 hover:text-red-400 p-1.5 rounded-lg transition-colors disabled:opacity-30 shrink-0"
                  title="Delete case"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
