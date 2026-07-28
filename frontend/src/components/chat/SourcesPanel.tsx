import { BookOpen, X } from 'lucide-react'
import { VariableSizeList as VList } from 'react-window'
import AutoSizer, { Size } from 'react-virtualized-auto-sizer'
import { SourceRow, type RowData } from './SourceCard'
import type { ChatSource } from '@/types/chat'

type Props = {
  show: boolean
  onHide: () => void
  sources: ChatSource[]
  vlistRef: React.RefObject<VList<RowData> | null>
  getItemSize: (i: number) => number
  itemData: RowData
}

export default function SourcesPanel({ show, onHide, sources, vlistRef, getItemSize, itemData }: Props) {
  return (
    <div className={`
      ${show ? 'flex' : 'hidden'} lg:flex
      w-full lg:w-72 xl:w-80 shrink-0 flex-col
      absolute lg:relative inset-0 lg:inset-auto
      bg-white lg:bg-gray-50 border-l border-gray-100 z-10 lg:z-auto
    `}>
      <div className="px-4 py-3.5 border-b border-gray-100 bg-white flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5 text-gray-400" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Sources</p>
        {sources.length > 0 && (
          <span className="ml-auto bg-rose-100 text-rose-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
            {sources.length}
          </span>
        )}
        <button onClick={onHide} className="lg:hidden ml-1 text-gray-400 hover:text-gray-600 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center px-4">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
            <BookOpen className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">Retrieved legislation and caselaw will appear here</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <AutoSizer>
            {({ height, width }: Size) => (
              <VList<RowData>
                ref={vlistRef}
                height={height}
                width={width}
                itemCount={sources.length}
                itemSize={getItemSize}
                itemData={itemData}
                overscanCount={3}
              >
                {SourceRow}
              </VList>
            )}
          </AutoSizer>
        </div>
      )}
    </div>
  )
}
