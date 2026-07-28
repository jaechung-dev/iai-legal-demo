import { Plus, X, Trash2 } from 'lucide-react'
import type { ConvSummary } from '@/types/chat'

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

type Props = {
  open: boolean
  onClose: () => void
  conversations: ConvSummary[]
  activeId: string | null
  deletingId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
}

export default function ConversationSidebar({
  open, onClose, conversations, activeId, deletingId, onNew, onSelect, onDelete,
}: Props) {
  return (
    <>
      {open && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-20" onClick={onClose} />
      )}
      <aside className={`
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 fixed lg:relative z-30 lg:z-auto
        top-0 left-0 h-full lg:h-auto
        w-[240px] shrink-0 flex flex-col
        bg-zinc-950 border-r border-zinc-800
        transition-transform duration-200 ease-in-out
      `}>
        <div className="flex items-center justify-between px-3 pt-4 pb-3 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Conversations</span>
          <button onClick={onClose} className="lg:hidden text-zinc-500 hover:text-zinc-300 p-1 rounded" aria-label="Close sidebar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3 py-3 border-b border-zinc-800">
          <button
            onClick={() => { onNew(); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center px-4 py-8 leading-relaxed">Your conversations will appear here</p>
          ) : (
            <ul>
              {conversations.map(conv => (
                <li key={conv.id}>
                  <button
                    onClick={() => { onSelect(conv.id); onClose() }}
                    className={`w-full text-left px-3 py-2.5 group flex items-start gap-2 transition-colors ${
                      activeId === conv.id
                        ? 'bg-zinc-800 text-white'
                        : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate leading-snug">
                        {conv.title.length > 42 ? conv.title.slice(0, 42) + '…' : conv.title}
                      </p>
                      <p className="text-zinc-600 text-xs mt-0.5">{relativeDate(conv.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => onDelete(conv.id, e)}
                      disabled={deletingId === conv.id}
                      className={`shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 ${
                        activeId === conv.id ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-600 hover:text-red-400'
                      } disabled:opacity-30`}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
