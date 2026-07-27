import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import Nav from '../components/Nav'
import { useAuth } from '@/context/auth'
import { API_URL as API } from '@/lib/config'
import {
  Shield, Users, FileText, Home, Briefcase, CreditCard,
  ShoppingBag, HelpCircle, Upload, X, Check, ChevronRight,
  ChevronLeft, AlertCircle, CheckCircle2, Pencil,
} from 'lucide-react'

type PersonalInfo = {
  name: string; dob: string; street: string; suburb: string;
  state: string; postcode: string; phone: string; contact: string;
}

type LegalMatter = {
  matterType: string; subType: string; description: string;
  incidentDate: string; urgency: string; courtDate: string;
  courtRef: string; outcome: string;
}

type UploadedFile = {
  id: string; name: string; size: number; category: string;
  s3Key: string | null; uploading: boolean; uploadError: string | null;
}

const MATTER_TYPES = [
  { id: 'criminal',   label: 'Criminal',    Icon: Shield,      desc: 'Charges, bail, sentencing, appeals' },
  { id: 'family',     label: 'Family',      Icon: Users,       desc: 'Divorce, custody, property, DVOs' },
  { id: 'civil',      label: 'Civil',       Icon: FileText,    desc: 'Disputes, injury, contracts' },
  { id: 'housing',    label: 'Housing',     Icon: Home,        desc: 'Tenancy, eviction, bonds, repairs' },
  { id: 'employment', label: 'Employment',  Icon: Briefcase,   desc: 'Dismissal, discrimination, wages' },
  { id: 'debt',       label: 'Debt',        Icon: CreditCard,  desc: 'Debt collection, bankruptcy' },
  { id: 'consumer',   label: 'Consumer',    Icon: ShoppingBag, desc: 'Refunds, warranties, scams' },
  { id: 'other',      label: 'Other',       Icon: HelpCircle,  desc: 'Something else' },
]

const SUB_TYPES: Record<string, string[]> = {
  criminal:   ['Bail application', 'Defending charges', 'Sentencing', 'Appeal', 'Parole', 'Other'],
  family:     ['Divorce / separation', 'Child custody / parenting', 'Property settlement', 'Domestic violence order', 'Child support', 'Other'],
  civil:      ['Contract dispute', 'Personal injury', 'Defamation', 'Negligence', 'Property dispute', 'Other'],
  housing:    ['Eviction / termination', 'Bond dispute', 'Repairs & maintenance', 'Lease issues', 'Other'],
  employment: ['Unfair dismissal', 'Workplace discrimination', 'Wage theft / underpayment', 'Workplace injury', 'Redundancy', 'Other'],
  debt:       ['Debt recovery', 'Bankruptcy / insolvency', 'Debt negotiation', 'Credit reporting', 'Other'],
  consumer:   ['Refund / return', 'Warranty claim', 'Scam / fraud', 'Product liability', 'Other'],
  other:      ['General legal advice', 'Other'],
}

const URGENCY = [
  { id: 'court',  label: 'Court date approaching', desc: 'I have a scheduled court appearance' },
  { id: 'urgent', label: 'Urgent — within 2 weeks', desc: 'Time-sensitive, needs quick attention' },
  { id: 'normal', label: 'When possible',           desc: 'No immediate deadline' },
]

const DOC_CATEGORIES = [
  'Court Order / Judgment', 'Police Statement / Report', 'Contract / Agreement',
  'Correspondence / Letters', 'Identity Document', 'Financial Record', 'Medical Record', 'Other',
]

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']
const DRAFT_KEY = 'iai_intake_draft'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 10
const ACCEPTED = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.heic'

const field = 'w-full border border-gray-200 bg-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-gray-400 shadow-sm'

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') } catch { return null }
}
function saveDraft(data: object) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch {}
}

async function uploadToS3(file: File, token: string | null): Promise<string> {
  const urlRes = await fetch(`${API}/intake/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename: file.name, content_type: file.type || 'application/octet-stream' }),
  })
  if (!urlRes.ok) throw new Error('Could not get upload URL')
  const { upload_url, key } = await urlRes.json()
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload to storage failed')
  return key
}

function Step1({ data, onChange }: { data: PersonalInfo; onChange: (d: PersonalInfo) => void }) {
  const set = (k: keyof PersonalInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...data, [k]: e.target.value })
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">About you</h2>
        <p className="text-sm text-gray-500 mt-1">We use this to personalise your case and check for conflicts.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Full legal name <span className="text-rose-500">*</span></label>
          <input className={field} placeholder="As it appears on official documents" value={data.name} onChange={set('name')} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Date of birth <span className="text-rose-500">*</span></label>
          <input type="date" className={field} value={data.dob} onChange={set('dob')} max={new Date().toISOString().slice(0,10)} required />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Phone number <span className="text-rose-500">*</span></label>
          <input type="tel" className={field} placeholder="04xx xxx xxx" value={data.phone} onChange={set('phone')} required />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Street address</label>
          <input className={field} placeholder="123 Example Street" value={data.street} onChange={set('street')} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Suburb <span className="text-rose-500">*</span></label>
          <input className={field} placeholder="Sydney" value={data.suburb} onChange={set('suburb')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">State</label>
            <select className={field} value={data.state} onChange={set('state')}>
              {AU_STATES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Postcode</label>
            <input className={field} placeholder="2000" maxLength={4} value={data.postcode} onChange={set('postcode')} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Preferred contact method</label>
        <div className="flex gap-3 flex-wrap">
          {(['phone', 'email', 'either'] as const).map(c => (
            <button key={c} type="button" onClick={() => onChange({ ...data, contact: c })}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${
                data.contact === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {c === 'either' ? 'Either' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Step2({ data, onChange }: { data: LegalMatter; onChange: (d: LegalMatter) => void }) {
  const set = (k: keyof LegalMatter, v: string) => onChange({ ...data, [k]: v })
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Your legal matter</h2>
        <p className="text-sm text-gray-500 mt-1">Tell us about what happened and what help you need.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Area of law <span className="text-rose-500">*</span></label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MATTER_TYPES.map(({ id, label, Icon, desc }) => (
            <button key={id} type="button" onClick={() => onChange({ ...data, matterType: id, subType: '' })}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all ${
                data.matterType === id ? 'border-emerald-300 bg-emerald-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <Icon className={`w-4 h-4 ${data.matterType === id ? 'text-emerald-600' : 'text-gray-400'}`} />
              <span className={`text-xs font-semibold ${data.matterType === id ? 'text-emerald-700' : 'text-gray-700'}`}>{label}</span>
              <span className="text-xs text-gray-400 leading-snug">{desc}</span>
            </button>
          ))}
        </div>
      </div>
      {data.matterType && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Specific issue</label>
          <div className="flex gap-2 flex-wrap">
            {(SUB_TYPES[data.matterType] || []).map(st => (
              <button key={st} type="button" onClick={() => set('subType', st)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  data.subType === st ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {st}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">What happened? <span className="text-rose-500">*</span></label>
        <textarea className={`${field} resize-none`} rows={5}
          placeholder="Describe the situation in your own words — what happened, when, and who was involved…"
          value={data.description} onChange={e => set('description', e.target.value)} required />
        <p className="text-xs text-gray-400">{data.description.length} / 2000 characters</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">When did this happen?</label>
          <input type="date" className={field} value={data.incidentDate} onChange={e => set('incidentDate', e.target.value)} max={new Date().toISOString().slice(0,10)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Court reference # <span className="text-gray-400 font-normal">(if known)</span></label>
          <input className={field} placeholder="e.g. 2025/00123" value={data.courtRef} onChange={e => set('courtRef', e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Urgency <span className="text-rose-500">*</span></label>
        <div className="space-y-2">
          {URGENCY.map(u => (
            <button key={u.id} type="button" onClick={() => set('urgency', u.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                data.urgency === u.id ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                data.urgency === u.id ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
              }`}>
                {data.urgency === u.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{u.label}</p>
                <p className="text-xs text-gray-400">{u.desc}</p>
              </div>
            </button>
          ))}
        </div>
        {data.urgency === 'court' && (
          <div className="mt-2 space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Court date</label>
            <input type="date" className={field} value={data.courtDate} onChange={e => set('courtDate', e.target.value)} min={new Date().toISOString().slice(0,10)} />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">What outcome are you hoping for?</label>
        <textarea className={`${field} resize-none`} rows={3}
          placeholder="e.g. I want to understand my rights, avoid a conviction, negotiate a settlement…"
          value={data.outcome} onChange={e => set('outcome', e.target.value)} />
      </div>
    </div>
  )
}

function Step3({ files, onFilesSelected, onRemove, onCategoryChange }: {
  files: UploadedFile[]
  onFilesSelected: (f: File[]) => void
  onRemove: (id: string) => void
  onCategoryChange: (id: string, cat: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function processFiles(fileList: FileList) {
    const errs: string[] = []
    const valid: File[] = []
    const remaining = MAX_FILES - files.length
    Array.from(fileList).slice(0, remaining).forEach(f => {
      if (f.size > MAX_FILE_SIZE) { errs.push(`${f.name}: exceeds 10 MB limit`); return }
      valid.push(f)
    })
    if (fileList.length > remaining) errs.push(`Only ${remaining} more file(s) can be added (limit: ${MAX_FILES})`)
    setErrors(errs)
    if (valid.length) onFilesSelected(valid)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Supporting documents</h2>
        <p className="text-sm text-gray-500 mt-1">Upload relevant documents. You can skip this step and add them later.</p>
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          dragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        <input ref={inputRef} type="file" className="hidden" multiple accept={ACCEPTED}
          onChange={e => e.target.files && processFiles(e.target.files)} />
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Upload className={`w-6 h-6 ${dragging ? 'text-emerald-500' : 'text-gray-400'}`} />
        </div>
        <p className="text-sm font-medium text-gray-700">{dragging ? 'Drop files here' : 'Drag & drop files here'}</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse — PDF, Word, images up to 10 MB each</p>
        <p className="text-xs text-gray-300 mt-1">{files.length} / {MAX_FILES} files</p>
      </div>
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {e}
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className={`flex items-start gap-3 bg-white border rounded-xl p-3 shadow-sm ${f.uploadError ? 'border-rose-200' : 'border-gray-100'}`}>
              <div className="w-9 h-9 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center shrink-0">
                {f.uploading
                  ? <span className="w-4 h-4 border-2 border-gray-300 border-t-emerald-500 rounded-full animate-spin" />
                  : f.uploadError ? <AlertCircle className="w-4 h-4 text-rose-400" />
                  : <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                <p className="text-xs text-gray-400">
                  {fmtSize(f.size)}
                  {f.uploading && <span className="ml-2 text-emerald-600">Uploading…</span>}
                  {f.uploadError && <span className="ml-2 text-rose-500">{f.uploadError}</span>}
                </p>
                {!f.uploading && !f.uploadError && (
                  <select className="mt-1.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    value={f.category} onChange={e => onCategoryChange(f.id, e.target.value)}>
                    {DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <button onClick={() => onRemove(f.id)} className="text-gray-300 hover:text-gray-500 p-1 transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-amber-700 mb-2">Useful documents to include</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {['Court orders or judgments', 'Police statements or reports', 'Contracts or agreements',
            'Letters / correspondence', 'Receipts or financial records', 'Photos or evidence'].map(d => (
            <div key={d} className="flex items-center gap-1.5 text-xs text-amber-700">
              <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
              {d}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Step4({ personal, matter, files, onGoToStep, agreed, onAgree, onSubmit, loading }: {
  personal: PersonalInfo; matter: LegalMatter; files: UploadedFile[]
  onGoToStep: (n: number) => void
  agreed: boolean; onAgree: (v: boolean) => void
  onSubmit: () => void; loading: boolean
}) {
  const { user } = useAuth()
  const matterLabel = MATTER_TYPES.find(m => m.id === matter.matterType)?.label
  const urgencyLabel = URGENCY.find(u => u.id === matter.urgency)?.label

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Review & submit</h2>
        <p className="text-sm text-gray-500 mt-1">Check your details before submitting.</p>
      </div>
      <SummaryCard title="About you" onEdit={() => onGoToStep(1)}>
        <SRow label="Name" value={personal.name} />
        <SRow label="Date of birth" value={personal.dob} />
        <SRow label="Phone" value={personal.phone} />
        <SRow label="Location" value={[personal.suburb, personal.state, personal.postcode].filter(Boolean).join(', ')} />
        <SRow label="Contact method" value={personal.contact} />
      </SummaryCard>
      <SummaryCard title="Legal matter" onEdit={() => onGoToStep(2)}>
        <SRow label="Area of law" value={matterLabel} />
        {matter.subType && <SRow label="Specific issue" value={matter.subType} />}
        <SRow label="Description" value={matter.description} multiline />
        {matter.incidentDate && <SRow label="Date of incident" value={matter.incidentDate} />}
        <SRow label="Urgency" value={urgencyLabel} />
        {matter.courtDate && <SRow label="Court date" value={matter.courtDate} />}
        {matter.courtRef && <SRow label="Court reference" value={matter.courtRef} />}
        {matter.outcome && <SRow label="Desired outcome" value={matter.outcome} multiline />}
      </SummaryCard>
      <SummaryCard title={`Documents (${files.length})`} onEdit={() => onGoToStep(3)}>
        {files.length === 0 ? (
          <p className="text-sm text-gray-400">No documents uploaded</p>
        ) : (
          <div className="space-y-1.5">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 shrink-0">📎</span>
                <span className="text-gray-700 truncate">{f.name}</span>
                <span className="text-gray-400 shrink-0">· {f.category}</span>
              </div>
            ))}
          </div>
        )}
      </SummaryCard>
      {!user && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Sign in to save your case</p>
            <p className="text-xs text-amber-600 mt-0.5">Your answers are saved locally. Create an account to keep them securely.</p>
            <div className="flex gap-2 mt-3">
              <Link to="/login" className="text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition-all">Sign in</Link>
              <Link to="/register" className="text-xs font-medium text-zinc-700 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-all">Create account</Link>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer group">
          <div onClick={() => onAgree(!agreed)}
            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
              agreed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 group-hover:border-gray-400'
            }`}>
            {agreed && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
          <span className="text-sm text-gray-600 leading-relaxed">
            I understand this platform provides <strong>legal information only</strong>, not legal advice,
            and that I should consult a qualified lawyer for advice specific to my situation.
            I consent to my information being stored and used to help answer my questions.
          </span>
        </label>
      </div>
      {files.some(f => f.uploading) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-center">
          Waiting for uploads to finish…
        </p>
      )}
      <button onClick={onSubmit}
        disabled={!agreed || loading || files.some(f => f.uploading) || (!personal.name || !matter.matterType || !matter.description || !matter.urgency)}
        className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl h-12 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg">
        {loading
          ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
          : <><CheckCircle2 className="w-4 h-4" /> Submit & go to assistant</>
        }
      </button>
      <p className="text-center text-xs text-gray-400">Your information is encrypted and never shared with third parties.</p>
    </div>
  )
}

function SummaryCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">{title}</p>
        <button onClick={onEdit} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  )
}

function SRow({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value) return null
  return (
    <div className={multiline ? '' : 'flex items-start gap-3'}>
      <p className="text-xs text-gray-400 shrink-0 w-28">{label}</p>
      <p className={`text-sm text-gray-800 ${multiline ? 'mt-0.5 leading-relaxed' : ''}`}>{value}</p>
    </div>
  )
}

const STEPS = ['About you', 'Legal matter', 'Documents', 'Review']

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => {
          const n = i + 1
          const done = n < step
          const active = n === step
          return (
            <div key={n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-gray-900 text-white ring-4 ring-gray-900/10' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : n}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? 'text-gray-900' : done ? 'text-emerald-600' : 'text-gray-400'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-5 transition-all ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SuccessScreen({ matterType }: { matterType: string }) {
  const navigate = useNavigate()
  const label = MATTER_TYPES.find(m => m.id === matterType)?.label || 'legal'
  const prompt = encodeURIComponent(`I have a ${label.toLowerCase()} matter and I've just submitted my case details. Can you help me understand my situation?`)

  useEffect(() => {
    const t = setTimeout(() => navigate(`/chat?q=${prompt}`), 3000)
    return () => clearTimeout(t)
  }, [navigate, prompt])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Case submitted</h2>
          <p className="text-sm text-gray-500 mt-2">Your {label.toLowerCase()} matter has been saved. Taking you to the AI assistant…</p>
        </div>
        <div className="flex justify-center gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <Link to={`/chat?q=${prompt}`}
          className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
          Go now <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}

const DEFAULT_PERSONAL: PersonalInfo = { name: '', dob: '', street: '', suburb: '', state: 'NSW', postcode: '', phone: '', contact: 'either' }
const DEFAULT_MATTER: LegalMatter = { matterType: '', subType: '', description: '', incidentDate: '', urgency: '', courtDate: '', courtRef: '', outcome: '' }

export default function IntakePage() {
  const { user, token } = useAuth()
  const [searchParams] = useSearchParams()

  const [step, setStep]         = useState(1)
  const [personal, setPersonal] = useState<PersonalInfo>(DEFAULT_PERSONAL)
  const [matter, setMatter]     = useState<LegalMatter>(DEFAULT_MATTER)
  const [files, setFiles]       = useState<UploadedFile[]>([])
  const [agreed, setAgreed]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [stepError, setStepError] = useState('')

  useEffect(() => {
    if (user && !personal.name) setPersonal(p => ({ ...p, name: user.name }))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = loadDraft()
    if (!d) return
    if (d.personal) setPersonal(d.personal)
    if (d.matter)   setMatter(d.matter)
    if (d.files)    setFiles(d.files)
  }, [])

  useEffect(() => {
    const s = parseInt(searchParams.get('step') ?? '1', 10)
    if (s >= 2 && s <= 4) setStep(s)
  }, [])

  const saveCurrent = useCallback(() => {
    saveDraft({ personal, matter, files })
  }, [personal, matter, files])

  useEffect(() => { saveCurrent() }, [saveCurrent])

  const handleFilesSelected = useCallback((rawFiles: File[]) => {
    rawFiles.forEach(file => {
      const entry: UploadedFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name, size: file.size, category: 'Other',
        s3Key: null, uploading: true, uploadError: null,
      }
      setFiles(prev => [...prev, entry])
      uploadToS3(file, token)
        .then(key => setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, s3Key: key, uploading: false } : f)))
        .catch(() => setFiles(prev => prev.map(f => f.id === entry.id ? { ...f, uploading: false, uploadError: 'Upload failed' } : f)))
    })
  }, [token])

  function validateStep(): string {
    if (step === 1) {
      if (!personal.name.trim()) return 'Please enter your full name.'
      if (!personal.dob)         return 'Please enter your date of birth.'
      if (!personal.phone.trim()) return 'Please enter your phone number.'
      if (!personal.suburb.trim()) return 'Please enter your suburb.'
    }
    if (step === 2) {
      if (!matter.matterType)         return 'Please select an area of law.'
      if (!matter.description.trim()) return 'Please describe what happened.'
      if (!matter.urgency)            return 'Please select an urgency level.'
    }
    return ''
  }

  function goNext() {
    const err = validateStep()
    if (err) { setStepError(err); return }
    setStepError('')
    setStep(s => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setStepError('')
    setStep(s => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          personal,
          matter,
          files: files.map(f => ({ name: f.name, size: f.size, category: f.category, key: f.s3Key })),
        }),
      })
      if (!res.ok) throw new Error('Submission failed')
      const data = await res.json()
      saveDraft({ personal, matter, files, submittedAt: new Date().toISOString(), id: data.id })
    } catch {
      saveDraft({ personal, matter, files, submittedAt: new Date().toISOString() })
    } finally {
      setLoading(false)
      setSubmitted(true)
    }
  }

  if (submitted) return <SuccessScreen matterType={matter.matterType} />

  return (
    <>
      <Nav />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <ProgressBar step={step} />
        {step === 1 && <Step1 data={personal} onChange={setPersonal} />}
        {step === 2 && <Step2 data={matter} onChange={setMatter} />}
        {step === 3 && (
          <Step3 files={files} onFilesSelected={handleFilesSelected}
            onRemove={id => setFiles(prev => prev.filter(f => f.id !== id))}
            onCategoryChange={(id, cat) => setFiles(prev => prev.map(f => f.id === id ? { ...f, category: cat } : f))} />
        )}
        {step === 4 && (
          <Step4 personal={personal} matter={matter} files={files}
            onGoToStep={n => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            agreed={agreed} onAgree={setAgreed} onSubmit={handleSubmit} loading={loading} />
        )}
        {stepError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {stepError}
          </div>
        )}
        {step < 4 && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            <button onClick={goBack} disabled={step === 1}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">Draft saved automatically</span>
              <button onClick={goNext}
                className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition-all shadow-sm">
                {step === 3 ? 'Review' : 'Continue'} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
