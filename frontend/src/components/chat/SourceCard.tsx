import { useState, useRef, useEffect, memo, useCallback } from 'react'
import type { ListChildComponentProps } from 'react-window'
import type { ChatSource } from '@/types/chat'

export type RowData = { sources: ChatSource[]; onResize: (i: number, h: number) => void }

type SourceCardProps = { source: ChatSource; onResize: (h: number) => void }

export const SourceCard = memo(function SourceCard({ source: s, onResize }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setExpanded(true); io.disconnect() } },
      { threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => { onResize(el.offsetHeight + 8) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [onResize])

  return (
    <div ref={ref} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-700 leading-snug">{s.citation}</p>
        <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium ${
          s.source_type === 'legislation' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'
        }`}>
          {s.source_type === 'legislation' ? 'Act' : 'Case'}
        </span>
      </div>
      <p className={`text-xs text-gray-500 leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-3'}`}>
        {s.content}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-1 bg-rose-400 rounded-full transition-all" style={{ width: `${Math.round(s.score * 100)}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{Math.round(s.score * 100)}%</span>
      </div>
    </div>
  )
})

export const SourceRow = memo(function SourceRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const handleResize = useCallback((h: number) => data.onResize(index, h), [data, index])
  return (
    <div style={style}>
      <div className="px-3 pb-2">
        <SourceCard source={data.sources[index]} onResize={handleResize} />
      </div>
    </div>
  )
})
