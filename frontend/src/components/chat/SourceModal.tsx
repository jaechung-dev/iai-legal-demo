import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { ChatSource } from '@/types/chat'

export default function SourceModal({ source: s, onClose }: { source: ChatSource; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Source detail"
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                s.source_type === 'legislation' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'
              }`}>
                {s.source_type === 'legislation' ? 'Legislation' : 'Caselaw'}
              </span>
              <span className="text-xs text-gray-400 tabular-nums">{Math.round(s.score * 100)}% match</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full w-7 h-7 flex items-center justify-center transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{s.citation}</h3>
        </div>

        <div className="px-5 py-4 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {s.content}
        </div>
      </div>
    </div>
  )
}
