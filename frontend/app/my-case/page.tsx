'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import TimelineClient, { CaseEvent } from '@/components/TimelineClient'
import { useAuth } from '@/context/auth'
import { API_URL as API } from '@/lib/config'
import {
  LayoutDashboard, CalendarDays, FolderOpen, FileText, UserCircle,
  Plus, Trash2, Upload, CheckCircle2, AlertCircle, Key, LogOut,
  Paperclip, X, ChevronRight, Menu,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type FileMeta = { name: string; size: number; category: string; key: string | null }

type CaseSummary = {
  id: string
  matter: { matterType?: string; subType?: string; urgency?: string; description?: string; courtDate?: string }
  file_count: number
  created_at: string
}

type CaseDetail = {
  id: string
  personal: Record<string, string>
  matter: Record<string, string>
  files: FileMeta[]
  created_at: string
}

type UploadState = { id: string; name: string; size: number; uploading: boolean; error: string | null }

// ── Helpers ────────────────────────────────────────────────────────────────────

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

const DOC_CATS = [
  'Court Order / Judgment', 'Police Statement / Report', 'Contract / Agreement',
  'Correspondence / Letters', 'Identity Document', 'Financial Record', 'Medical Record', 'Other',
]

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  )
}

function Row({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value) return null
  return (
    <div className={multiline ? 'space-y-0.5' : 'flex items-start gap-3'}>
      <p className="text-xs text-gray-400 shrink-0 w-28">{label}</p>
      <p className={`text-sm text-gray-800 ${multiline ? 'leading-relaxed mt-0.5' : ''}`}>{value}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <span className="w-6 h-6 border-2 border-gray-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )
}

// ── Section: Summary ───────────────────────────────────────────────────────────

function SummarySection({ detail }: { detail: CaseDetail | null }) {
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
        {p.suburb && (
          <Row label="Location" value={[p.suburb, p.state, p.postcode].filter(Boolean).join(', ')} />
        )}
        <Row label="Preferred contact" value={p.contact} />
      </Card>
      <Card title={`Documents (${files.length})`}>
        {files.length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded.</p>
        ) : (
          files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-gray-700 truncate">{f.name}</span>
              <span className="text-xs text-gray-400 shrink-0">· {f.category}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}

// ── Section: Timeline ──────────────────────────────────────────────────────────

function TimelineSection({ caseId }: { caseId: string }) {
  const [events, setEvents] = useState<CaseEvent[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setEvents(null)
    setErr('')
    fetch(`${API}/case/${caseId}/timeline`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.events) setEvents(d.events)
        else setErr('No timeline events found for this case.')
      })
      .catch(() => setErr('Could not load timeline.'))
  }, [caseId])

  if (err) return (
    <div className="py-16 text-center">
      <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-400">{err}</p>
    </div>
  )
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-6">Case Timeline</h2>
      {events ? <TimelineClient events={events} /> : <Spinner />}
    </div>
  )
}

// ── Section: Manage Cases ──────────────────────────────────────────────────────

function CasesSection({
  cases, activeCaseId, token, onActivate, onDeleted,
}: {
  cases: CaseSummary[]
  activeCaseId: string
  token: string | null
  onActivate: (id: string) => void
  onDeleted: (id: string) => void
}) {
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
        <Link
          href="/intake/?step=2"
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> New case
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
          <p className="text-sm text-gray-400 mb-3">No cases submitted yet.</p>
          <Link href="/intake/?step=2" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 justify-center">
            Submit your first case <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map(c => {
            const active = c.id === activeCaseId
            return (
              <div
                key={c.id}
                className={`flex items-center gap-4 p-4 bg-white rounded-xl border shadow-sm transition-all ${
                  active ? 'border-emerald-200 ring-1 ring-emerald-200/50' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <button onClick={() => onActivate(c.id)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-800">
                      {MATTER_LABELS[c.matter?.matterType ?? ''] ?? c.matter?.matterType ?? 'Case'}
                    </span>
                    {c.matter?.subType && (
                      <span className="text-xs text-gray-400">· {c.matter.subType}</span>
                    )}
                    {active && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                    )}
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

// ── Section: Manage Documents ──────────────────────────────────────────────────

function DocumentsSection({
  detail, caseId, token, onFilesUpdated,
}: {
  detail: CaseDetail | null
  caseId: string
  token: string | null
  onFilesUpdated: (files: FileMeta[]) => void
}) {
  const [pending, setPending] = useState<UploadState[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const files = detail?.files ?? []

  async function patchFiles(updated: FileMeta[]) {
    const res = await fetch(`${API}/case/${caseId}/files`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ files: updated }),
    })
    if (!res.ok) throw new Error('Failed to update documents')
  }

  const MAX_FILE_BYTES = 25 * 1024 * 1024

  function handleFileInput(fileList: FileList) {
    Array.from(fileList).forEach(async file => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setPending(p => [...p, { id: uid, name: file.name, size: file.size, uploading: true, error: null }])
      try {
        if (file.size > MAX_FILE_BYTES) throw new Error('File exceeds 25 MB limit')
        const urlRes = await fetch(`${API}/intake/upload-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ filename: file.name, content_type: file.type || 'application/octet-stream', case_id: caseId }),
        })
        if (!urlRes.ok) throw new Error('Could not get upload URL')
        const { upload_url, key } = await urlRes.json()
        const put = await fetch(upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!put.ok) throw new Error('Upload to storage failed')
        const updated: FileMeta[] = [...files, { name: file.name, size: file.size, category: 'Other', key }]
        await patchFiles(updated)
        onFilesUpdated(updated)
        setPending(p => p.filter(u => u.id !== uid))
      } catch (e) {
        setPending(p => p.map(u =>
          u.id === uid ? { ...u, uploading: false, error: (e as Error).message } : u
        ))
      }
    })
  }

  async function removeFile(idx: number) {
    const updated = files.filter((_, i) => i !== idx)
    await patchFiles(updated)
    onFilesUpdated(updated)
  }

  async function updateCategory(idx: number, cat: string) {
    const updated = files.map((f, i) => i === idx ? { ...f, category: cat } : f)
    await patchFiles(updated)
    onFilesUpdated(updated)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Manage Documents</h2>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <Upload className="w-4 h-4" /> Add documents
        </button>
        <input
          ref={inputRef} type="file" className="hidden" multiple
          accept=".pdf,.doc,.docx,.txt,.eml,.jpg,.jpeg,.png,.tiff"
          onChange={e => e.target.files && handleFileInput(e.target.files)}
        />
      </div>

      {files.length === 0 && pending.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Upload documents</p>
          <p className="text-xs text-gray-400 mt-1">PDF, Word, email (.eml), images · 25 MB max</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                <p className="text-xs text-gray-400">{fmtSize(f.size)}</p>
                <select
                  className="mt-1.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  value={f.category}
                  onChange={e => updateCategory(i, e.target.value)}
                >
                  {DOC_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="text-gray-300 hover:text-red-400 p-1 transition-colors shrink-0 mt-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {pending.map(u => (
            <div key={u.id} className={`flex items-start gap-3 bg-white border rounded-xl p-3 shadow-sm ${u.error ? 'border-rose-100' : 'border-gray-100'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${u.error ? 'bg-rose-50 border border-rose-100' : 'bg-gray-50 border border-gray-100'}`}>
                {u.uploading
                  ? <span className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                  : <AlertCircle className="w-4 h-4 text-rose-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                <p className="text-xs">
                  {u.uploading
                    ? <span className="text-emerald-600">Uploading…</span>
                    : <span className="text-rose-500">{u.error}</span>
                  }
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section: My Information ────────────────────────────────────────────────────

function ProfileSection() {
  const { user, logout } = useAuth()
  const router = useRouter()
  if (!user) return null

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900">My Information</h2>
      <Card title="Account">
        <Row label="Name" value={user.name} />
        <Row label="Role" value={user.role} />
        <Row label="Email verified" value={user.email_verified ? 'Yes' : 'No'} />
      </Card>
      <Card title="Security">
        <div className="py-1">
          <Link
            href="/forgot-password/"
            className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 hover:border-gray-300 px-4 py-2.5 rounded-xl transition-all shadow-sm font-medium"
          >
            <Key className="w-4 h-4 text-gray-400" /> Change password
          </Link>
        </div>
      </Card>
      <Card title="Session">
        <div className="py-1">
          <button
            onClick={async () => { await logout(); router.push('/login/') }}
            className="inline-flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </Card>
    </div>
  )
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'summary',   label: 'Summary',          Icon: LayoutDashboard },
  { id: 'timeline',  label: 'Timeline',          Icon: CalendarDays    },
  { id: 'cases',     label: 'Manage Cases',      Icon: FolderOpen      },
  { id: 'documents', label: 'Manage Documents',  Icon: FileText        },
  { id: 'profile',   label: 'My Information',    Icon: UserCircle      },
] as const

type SectionId = typeof SECTIONS[number]['id']

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MyCasePage() {
  const { user, token, loading: authLoading } = useAuth()
  const router = useRouter()
  const [section, setSection] = useState<SectionId>('summary')
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loadingCases, setLoadingCases] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login/')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!token) return
    setLoadingCases(true)
    fetch(`${API}/user/cases`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: CaseSummary[]) => {
        setCases(data)
        if (data.length > 0) setActiveCaseId(data[0].id)
        setLoadingCases(false)
      })
      .catch(() => setLoadingCases(false))
  }, [token])

  useEffect(() => {
    if (!activeCaseId || !token) return
    setDetail(null)
    fetch(`${API}/case/${activeCaseId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setDetail(d))
      .catch(() => {})
  }, [activeCaseId, token])

  const handleDeleted = useCallback((id: string) => {
    setCases(prev => {
      const next = prev.filter(c => c.id !== id)
      if (activeCaseId === id) {
        setActiveCaseId(next[0]?.id ?? null)
        setDetail(null)
      }
      return next
    })
  }, [activeCaseId])

  const handleFilesUpdated = useCallback((files: FileMeta[]) => {
    setDetail(prev => prev ? { ...prev, files } : prev)
    setCases(prev => prev.map(c =>
      c.id === activeCaseId ? { ...c, file_count: files.length } : c
    ))
  }, [activeCaseId])

  if (authLoading) return (
    <div className="h-screen flex flex-col bg-gray-50"><Nav /><Spinner /></div>
  )
  if (!user) return null

  const noCases = !loadingCases && cases.length === 0
  const needsCase = noCases && section !== 'cases' && section !== 'profile'
  const activeCase = cases.find(c => c.id === activeCaseId)

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Nav />
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 bg-black/40 z-20" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          fixed lg:relative z-30 lg:z-auto
          top-0 left-0 h-full lg:h-auto
          w-[240px] shrink-0 flex flex-col
          bg-zinc-950 border-r border-zinc-800
          transition-transform duration-200 ease-in-out
        `}>
          <div className="px-4 pt-5 pb-4 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">My Case</p>
            {activeCase && (
              <p className="text-xs text-zinc-500 mt-1.5 truncate">
                {MATTER_LABELS[activeCase.matter?.matterType ?? ''] ?? 'Active case'}
                {activeCase.matter?.subType ? ` · ${activeCase.matter.subType}` : ''}
              </p>
            )}
          </div>

          <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
            {SECTIONS.map(({ id, label, Icon }) => {
              const disabled = noCases && id !== 'cases' && id !== 'profile'
              return (
                <button
                  key={id}
                  onClick={() => {
                    if (!disabled) { setSection(id); setSidebarOpen(false) }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    section === id
                      ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                      : disabled
                        ? 'text-zinc-700 cursor-not-allowed'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              )
            })}
          </nav>

          <div className="px-3 py-3 border-t border-zinc-800">
            <Link
              href="/intake/?step=2"
              className="flex items-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" /> New case
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* Mobile header bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-800 p-1">
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {SECTIONS.find(s => s.id === section)?.label}
            </span>
          </div>

          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
            {/* No-case prompt for sections that need a case */}
            {needsCase ? (
              <div className="text-center py-20">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <FolderOpen className="w-7 h-7 text-gray-400" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">No case on file</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
                  Submit your case details and documents to unlock the full dashboard.
                </p>
                <Link
                  href="/intake/?step=2"
                  className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Start intake
                </Link>
              </div>
            ) : (
              <>
                {section === 'summary'   && <SummarySection detail={detail} />}
                {section === 'timeline'  && activeCaseId && <TimelineSection caseId={activeCaseId} />}
                {section === 'cases'     && (
                  <CasesSection
                    cases={cases}
                    activeCaseId={activeCaseId ?? ''}
                    token={token}
                    onActivate={id => { setActiveCaseId(id); setSection('summary') }}
                    onDeleted={handleDeleted}
                  />
                )}
                {section === 'documents' && activeCaseId && (
                  <DocumentsSection
                    detail={detail}
                    caseId={activeCaseId}
                    token={token}
                    onFilesUpdated={handleFilesUpdated}
                  />
                )}
                {section === 'profile' && <ProfileSection />}
              </>
            )}
          </div>
        </main>

      </div>
    </div>
  )
}
