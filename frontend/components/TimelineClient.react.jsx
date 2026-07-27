/**
 * REACT VERSION — learn this first, before reading TimelineClient.tsx
 *
 * Same component, plain JavaScript (no TypeScript).
 * Every concept is labeled so you can map it to the vanilla.js version.
 *
 * Read order:
 *   1. TimelineClient.vanilla.js  ← pure JS baseline
 *   2. TimelineClient.react.jsx   ← this file (React concepts)
 *   3. TimelineClient.tsx         ← production version (TypeScript + optimizations)
 */

import { useState, useEffect } from 'react'

// ─── React component = a function that returns JSX ────────────────────────────
// "JSX" looks like HTML but compiles to React.createElement() calls.
// React calls this function whenever state changes (automatic re-render).
export default function TimelineClient({ events }) {
  // useState(initial) returns [currentValue, setterFunction]
  // When you call setter → React re-runs the whole function with the new value.
  // Vanilla equivalent: let currentFilter = 'All'; + manual render()
  const [filter, setFilter] = useState('All')

  // useState for the modal — null means "no modal open"
  const [selected, setSelected] = useState(null)

  // Derived values: plain JS, recalculated every render
  const cats     = ['All', ...new Set(events.map(e => e.category))]
  const filtered = filter === 'All' ? events : events.filter(e => e.category === filter)

  // JSX return = what the browser should show right now
  return (
    // Fragments (<> </>) let you return multiple elements without a wrapper div
    <>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {cats.map(cat => (
          // React needs a unique "key" when rendering a list — for diffing
          <button
            key={cat}
            onClick={() => setFilter(cat)}   // onClick = addEventListener('click')
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid',
              background: cat === filter ? '#111' : '#fff',
              color:      cat === filter ? '#fff' : '#555',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Event list */}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {filtered.map((e, i) => (
          <li
            key={i}
            onClick={() => setSelected(e)}   // sets state → React re-renders → modal appears
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
              {e.date} · <strong>{e.category}</strong>
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{e.subject}</p>
            {e.summary && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{e.summary}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Conditional render: { condition && <Component /> } */}
      {selected && (
        <EventModal event={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

// ─── Child component ──────────────────────────────────────────────────────────
// Props flow DOWN (parent → child). Events flow UP via callback props.
// onClose is a function the parent passed in — child calls it to "talk back up".
function EventModal({ event, onClose }) {
  // useEffect runs AFTER render, for side-effects (DOM events, timers, fetch)
  // Vanilla equivalent: document.addEventListener('keydown', ...)
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    // Return value = cleanup function: React calls this before unmounting
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])  // dependency array: only re-run if onClose changes

  return (
    // Fixed overlay — clicking it calls onClose (parent updates selected → modal unmounts)
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      {/* e.stopPropagation() prevents the click from bubbling to the overlay */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 560, maxHeight: '80vh',
          overflowY: 'auto', position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
        >✕</button>

        <p style={{ fontSize: 11, color: '#999', margin: '0 0 8px' }}>
          {event.date} · {event.category}
        </p>
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>{event.subject}</h2>
        {event.summary && (
          <p style={{ margin: '0 0 16px', color: '#666', fontSize: 13 }}>{event.summary}</p>
        )}
        <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 16 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {event.content}
          </p>
        </div>
      </div>
    </div>
  )
}
