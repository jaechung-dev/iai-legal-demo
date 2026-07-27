import { ChevronDown, ChevronUp, MessageSquare, ExternalLink } from 'lucide-react'
import type { SearchResult as SearchResultType } from '@/types/search'

type Props = {
  result: SearchResultType
  expanded: boolean
  onToggle: () => void
  onAsk: (title: string) => void
}

export default function SearchResult({ result: r, expanded, onToggle, onAsk }: Props) {
  const title = r.metadata.citation || r.metadata.case_name || r.metadata.source
  const austliiQuery = encodeURIComponent(title)

  return (
    <div className={`bg-white border rounded-xl shadow-sm transition-all cursor-pointer ${
      expanded ? 'border-emerald-200 shadow-emerald-50' : 'border-gray-100 hover:shadow-md hover:border-gray-200'
    }`}>
      <button className="w-full text-left p-5" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-1.5 bg-emerald-400 rounded-full" style={{ width: `${Math.round(r.metadata.score * 100)}%` }} />
              </div>
              <span className="text-xs text-gray-400 tabular-nums">{Math.round(r.metadata.score * 100)}%</span>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
        <p className={`text-sm text-gray-600 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{r.content}</p>
      </button>
      {expanded && (
        <div className="px-5 pb-4 flex items-center gap-3 border-t border-gray-50 pt-3">
          <button
            onClick={(e) => { e.stopPropagation(); onAsk(title) }}
            className="flex items-center gap-1.5 text-xs bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Ask about this
          </button>
          <a
            href={`https://www.austlii.edu.au/cgi-bin/sino/search/search.cgi?query=${austliiQuery}&meta=+[2020]+&mask_path=au/legis/nsw`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View on AustLII
          </a>
        </div>
      )}
    </div>
  )
}
