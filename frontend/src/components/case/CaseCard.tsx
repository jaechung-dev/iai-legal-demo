export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  )
}

export function Row({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value) return null
  return (
    <div className={multiline ? 'space-y-0.5' : 'flex items-start gap-3'}>
      <p className="text-xs text-gray-400 shrink-0 w-28">{label}</p>
      <p className={`text-sm text-gray-800 ${multiline ? 'leading-relaxed mt-0.5' : ''}`}>{value}</p>
    </div>
  )
}
