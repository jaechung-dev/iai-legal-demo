import { useState, useRef } from 'react'
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { API_URL as API } from '@/lib/config'
import type { FileMeta, CaseDetail, UploadState } from '@/types/case'

const DOC_CATS = [
  'Court Order / Judgment', 'Police Statement / Report', 'Contract / Agreement',
  'Correspondence / Letters', 'Identity Document', 'Financial Record', 'Medical Record', 'Other',
]

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

type Props = {
  detail: CaseDetail | null
  caseId: string
  token: string | null
  onFilesUpdated: (files: FileMeta[]) => void
}

export default function DocumentsSection({ detail, caseId, token, onFilesUpdated }: Props) {
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

  function handleFileInput(fileList: FileList) {
    Array.from(fileList).forEach(async file => {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setPending(p => [...p, { id: uid, name: file.name, size: file.size, uploading: true, error: null }])
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('File exceeds 25 MB limit')
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
        setPending(p => p.map(u => u.id === uid ? { ...u, uploading: false, error: (e as Error).message } : u))
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
        <button onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all shadow-sm">
          <Upload className="w-4 h-4" /> Add documents
        </button>
        <input ref={inputRef} type="file" className="hidden" multiple
          accept=".pdf,.doc,.docx,.txt,.eml,.jpg,.jpeg,.png,.tiff"
          onChange={e => e.target.files && handleFileInput(e.target.files)} />
      </div>

      {files.length === 0 && pending.length === 0 ? (
        <div onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-all">
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">Upload documents</p>
          <p className="text-xs text-gray-400 mt-1">PDF, Word, email (.eml), images · 25 MB max</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="w-9 h-9 bg-rose-50 border border-rose-100 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                <p className="text-xs text-gray-400">{fmtSize(f.size)}</p>
                <select
                  className="mt-1.5 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  value={f.category}
                  onChange={e => updateCategory(i, e.target.value)}
                >
                  {DOC_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-400 p-1 transition-colors shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {pending.map(u => (
            <div key={u.id} className={`flex items-start gap-3 bg-white border rounded-xl p-3 shadow-sm ${u.error ? 'border-rose-100' : 'border-gray-100'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${u.error ? 'bg-rose-50 border border-rose-100' : 'bg-gray-50 border border-gray-100'}`}>
                {u.uploading
                  ? <span className="w-4 h-4 border-2 border-gray-300 border-t-rose-500 rounded-full animate-spin" />
                  : <AlertCircle className="w-4 h-4 text-rose-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                <p className="text-xs">
                  {u.uploading
                    ? <span className="text-rose-600">Uploading…</span>
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
