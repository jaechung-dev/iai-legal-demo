import { memo } from 'react'
import { Maximize2 } from 'lucide-react'
import type { ChatSource } from '@/types/chat'

// A retrieved source (preview). Clicking opens the full detail in a modal.
export const SourceCard = memo(function SourceCard(
  { source: s, onOpen }: { source: ChatSource; onOpen: (s: ChatSource) => void },
) {
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      aria-label={`View source: ${s.citation}`}
      className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 shadow-sm transition-all group cursor-pointer hover:border-rose-300 hover:ring-1 hover:ring-rose-200 hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-700 leading-snug group-hover:text-gray-900 line-clamp-2">{s.citation}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            s.source_type === 'legislation' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'
          }`}>
            {s.source_type === 'legislation' ? 'Act' : 'Case'}
          </span>
          <Maximize2 className="w-3 h-3 text-gray-300 group-hover:text-rose-500 transition-colors" aria-hidden="true" />
        </div>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-3">{s.content}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-1 bg-rose-400 rounded-full transition-all" style={{ width: `${Math.round(s.score * 100)}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{Math.round(s.score * 100)}%</span>
      </div>
    </button>
  )
})
