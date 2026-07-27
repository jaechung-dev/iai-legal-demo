# React Structure — Learn First

Read order: `vanilla.js` → **this file** → `TimelineClient.tsx` (production)

---

## Murphy's Law in React

> *"Anything that can go wrong, will go wrong."*

These are the bugs that hit every React developer — usually in production, never in testing.

### 1. Missing `key` prop → list shuffles on re-render

```jsx
// You built a todo list. Works fine. Then the user sorts it.
// React reuses the wrong DOM nodes → inputs show the old user's text.

// ✗ this will bite you
{todos.map((todo, i) => <input key={i} defaultValue={todo.text} />)}

// ✓ stable id = safe sort/filter
{todos.map(todo => <input key={todo.id} defaultValue={todo.text} />)}
```

Murphy: *"Index keys work fine — until the user reorders."*

---

### 2. Stale closure in useEffect → reads old state forever

```jsx
// You add a keydown listener. It always logs 0, even when count is 5.
// The handler "closed over" count=0 at mount time and never updated.

useEffect(() => {
  window.addEventListener('keydown', () => console.log(count))  // always 0
}, [])  // ✗ missing dependency

// ✓ either add count to deps, or use a ref
useEffect(() => {
  window.addEventListener('keydown', () => console.log(count))
}, [count])  // re-registers whenever count changes
```

Murphy: *"Your cleanup looked fine — until someone held a key down for 2 seconds."*

---

### 3. `useEffect` fetch — component unmounts before response arrives

```jsx
// User clicks a link 200ms after the search starts.
// Component unmounts. Response arrives. setState on dead component → memory leak warning.

useEffect(() => {
  let cancelled = false
  fetch('/api/search').then(data => {
    if (!cancelled) setResults(data)  // ✓ guard against stale response
  })
  return () => { cancelled = true }   // cleanup: ignore the response
}, [query])
```

Murphy: *"Fast connections never expose this. Slow 3G on a phone will."*

---

### 4. Object/array as prop → infinite re-render loop

```jsx
// Parent renders 60 times per second. Why?
// Because {} !== {} in JavaScript — new object reference every render.

function Parent() {
  return <Child options={{ limit: 10 }} />  // ✗ new object every render
}

// Child has:
useEffect(() => { fetch(options) }, [options])  // fires every render → infinite loop

// ✓ memoize or move the constant outside the component
const OPTIONS = { limit: 10 }
function Parent() {
  return <Child options={OPTIONS} />
}
```

Murphy: *"It works in dev. React Strict Mode double-invokes effects — suddenly infinite loop."*

---

### 5. The bundle size you didn't notice until production

```
// You import one icon from a library.
import { Loader } from 'some-icon-library'

// That library has no tree-shaking → you shipped 800 icons.
// Locally on fast wifi: fine. Mobile user on 4G: 8-second load.
```

Murphy: *"The user who hits your slow load will be your most important demo."*  
Fix: check `vite build` output after every new dependency. Gzip size is what matters.

---

## The component skeleton

```jsx
export default function TimelineClient({ events }) {
  // 1. state
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState(null)

  // 2. derived values (plain JS, recalculated every render)
  const filtered = filter === 'All' ? events : events.filter(e => e.category === filter)

  // 3. JSX return = what to show right now
  return (
    <>
      <FilterChips />
      <EventList />
      {selected && <Modal />}   {/* conditional render */}
    </>
  )
}
```

---

## 1. useState — replaces manual variables + render()

```js
// vanilla.js
let currentFilter = 'All'
function render() { /* rebuild DOM by hand */ }

// React
const [filter, setFilter] = useState('All')
// calling setFilter('Court') → React re-runs the function automatically
```

| Vanilla | React |
|---|---|
| `let x = value` | `const [x, setX] = useState(value)` |
| `x = newValue; render()` | `setX(newValue)` |
| rebuild `innerHTML` | React diffs and patches only what changed |

---

## 2. JSX — compiled HTML, not a string

```jsx
// This JSX:
<button onClick={() => setFilter(cat)}>{cat}</button>

// Compiles to:
React.createElement('button', { onClick: () => setFilter(cat) }, cat)
```

**Rules:**
- `onClick` not `onclick` (camelCase always)
- `className` not `class`
- Every list item needs a `key` prop so React can track changes:
  ```jsx
  {cats.map(cat => <button key={cat}>{cat}</button>)}
  ```

---

## 3. Props + callbacks — data down, events up

```jsx
// Parent passes data AND a callback
<EventModal event={selected} onClose={() => setSelected(null)} />

// Child receives and uses them
function EventModal({ event, onClose }) {
  return <button onClick={onClose}>✕</button>
}
```

Data always flows **down** (parent → child via props).  
To send something **up**, the parent passes a function and the child calls it.

---

## 4. useEffect — side-effects after render

```jsx
useEffect(() => {
  // runs AFTER the component appears in the DOM
  document.addEventListener('keydown', handler)

  // returned function runs when component is removed (unmount)
  return () => document.removeEventListener('keydown', handler)

}, [onClose])  // re-run only when onClose changes
//  ^^^^^^^^^ dependency array — omit = run every render, [] = run once
```

Vanilla equivalent: `addEventListener` in a setup function + manual cleanup.

---

## 5. Conditional render

```jsx
// Nothing renders if selected is null/undefined/false
{selected && <EventModal event={selected} onClose={() => setSelected(null)} />}

// When setSelected(null) is called → selected is falsy → modal unmounts
```

The modal appears and disappears purely from state — no `display: none`, no `remove()`.

---

## Full component (plain JSX, no TypeScript)

```jsx
import { useState, useEffect } from 'react'

export default function TimelineClient({ events }) {
  const [filter, setFilter]     = useState('All')
  const [selected, setSelected] = useState(null)

  const cats     = ['All', ...new Set(events.map(e => e.category))]
  const filtered = filter === 'All' ? events : events.filter(e => e.category === filter)

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {cats.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}>
            {cat}
          </button>
        ))}
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {filtered.map((e, i) => (
          <li key={i} onClick={() => setSelected(e)}>
            <span>{e.date} · {e.category}</span>
            <p>{e.subject}</p>
          </li>
        ))}
      </ul>

      {selected && (
        <EventModal event={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

function EventModal({ event, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: 24 }}>
        <button onClick={onClose}>✕</button>
        <h2>{event.subject}</h2>
        <p>{event.content}</p>
      </div>
    </div>
  )
}
```

---

---

## Core Concepts

### Virtual DOM — why React is fast

```
Your state change
      ↓
React builds a new virtual DOM (plain JS objects, cheap)
      ↓
Diffs old virtual DOM vs new virtual DOM
      ↓
Patches ONLY the changed real DOM nodes
```

Vanilla JS with `innerHTML` rebuilds everything every time.  
React touches only what actually changed.

---

### Re-render rules

```jsx
// A component re-renders when:
// 1. Its own state changes (setFilter, setSelected)
// 2. Its parent re-renders and passes new props
// 3. A context it subscribes to changes

// A component does NOT re-render when:
// - A sibling changes
// - An unrelated piece of state changes elsewhere in the tree
```

---

### Props vs State

| | Props | State |
|---|---|---|
| Who owns it? | Parent | The component itself |
| Can it change? | No — read-only inside child | Yes — via setter |
| What changes it? | Parent re-renders with new props | `setState(newValue)` |
| Analogy | Function argument | Local variable that persists |

```jsx
// Props: passed in, you cannot mutate them
function Card({ title }) {
  title = 'changed'  // ✗ never do this — React won't know
}

// State: you own it, change via setter only
const [title, setTitle] = useState('original')
setTitle('changed')  // ✓ React sees this and re-renders
```

---

### Lifting state up

When two sibling components need to share state, move it to their parent.

```jsx
// ✗ each keeps its own filter — they can't talk to each other
function FilterBar() { const [filter, setFilter] = useState('All') }
function EventList() { const [filter, setFilter] = useState('All') }

// ✓ parent owns the state, passes it down
function Timeline() {
  const [filter, setFilter] = useState('All')    // one source of truth
  return (
    <>
      <FilterBar filter={filter} onFilter={setFilter} />
      <EventList filter={filter} />
    </>
  )
}
```

---

### Hooks rules (must memorize)

```jsx
// ✓ always at the top of the component, unconditionally
function MyComponent() {
  const [x, setX] = useState(0)
  useEffect(() => { ... }, [])

  // ✗ never inside an if/loop/nested function
  if (condition) {
    const [y, setY] = useState(0)  // breaks React's hook order tracking
  }
}
```

React tracks hooks by their **order of call** on every render — the order must never change.

---

### Event bubbling + stopPropagation

```jsx
// Clicking the inner div would also trigger the outer div's onClick
// unless you stop it
<div onClick={closeModal}>               {/* overlay: click anywhere to close */}
  <div onClick={e => e.stopPropagation()}> {/* modal box: clicks stay here */}
    content
  </div>
</div>
```

Same as vanilla — DOM events bubble up through parent elements unless stopped.

---

### key prop — how React tracks list items

```jsx
// Without key: React re-renders ALL items on every filter change
{items.map(item => <Card />)}

// With key: React reuses DOM nodes that haven't changed
{items.map(item => <Card key={item.id} />)}

// ✗ using index as key breaks when list order changes (sorting, filtering)
{items.map((item, i) => <Card key={i} />)}

// ✓ use a stable, unique identifier
{items.map(item => <Card key={item.id} />)}
```

---

### Component lifecycle (hooks version)

```jsx
useEffect(() => {
  // ── MOUNT: runs once after first render ──
  fetch('/api/data').then(...)
  document.addEventListener('keydown', handler)

  return () => {
    // ── UNMOUNT: cleanup before component is removed ──
    document.removeEventListener('keydown', handler)
  }
}, [])  // empty array = "only on mount/unmount"


useEffect(() => {
  // ── UPDATE: runs after every render where `query` changed ──
  fetch(`/api/search?q=${query}`)
}, [query])  // re-runs whenever query changes


useEffect(() => {
  // ── EVERY RENDER: no dependency array ──
  console.log('rendered')
})
```

---

## What TypeScript adds (TimelineClient.tsx)

```tsx
// 1. Prop types — catches mistakes at build time, not runtime
function TimelineClient({ events }: { events: CaseEvent[] }) { ... }

// 2. State types — TypeScript infers these automatically
const [selected, setSelected] = useState<CaseEvent | null>(null)

// 3. Event handler types
const handler = (ev: KeyboardEvent) => { ... }
```

Everything else is identical — TypeScript is just labels on top of JS.
