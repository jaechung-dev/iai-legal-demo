/**
 * VANILLA JS — no framework, no build step
 * Demonstrates the same "filter chips + event list" logic as TimelineClient.tsx
 * using only browser APIs.
 *
 * Usage (drop into any HTML page):
 *   <div id="timeline"></div>
 *   <script src="TimelineClient.vanilla.js"></script>
 *   <script>renderTimeline(document.getElementById('timeline'), events)</script>
 */

// ─── state lives as plain variables ───────────────────────────────────────────
// In React this would be: const [filter, setFilter] = useState('All')
let currentFilter = 'All'
let currentEvents = []
let rootEl        = null

// ─── re-render: called every time state changes ────────────────────────────────
// React does this automatically when state updates; here we do it manually.
function render() {
  const filtered = currentFilter === 'All'
    ? currentEvents
    : currentEvents.filter(e => e.category === currentFilter)

  const cats = ['All', ...new Set(currentEvents.map(e => e.category))]

  // innerHTML = the "JSX return" equivalent. Fast enough for small lists;
  // for large lists you'd diff the DOM manually (that's what React's virtual DOM does).
  rootEl.innerHTML = `
    <div class="filter-chips">
      ${cats.map(cat => `
        <button
          data-cat="${cat}"
          class="chip ${cat === currentFilter ? 'active' : ''}"
        >${cat}</button>
      `).join('')}
    </div>
    <ul class="timeline">
      ${filtered.map(e => `
        <li class="event-card" data-id="${e.id}">
          <span class="date">${e.date}</span>
          <span class="badge">${e.category}</span>
          <p class="subject">${e.subject}</p>
        </li>
      `).join('')}
    </ul>
  `

  // attach events AFTER innerHTML (old nodes are gone, listeners lost)
  rootEl.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.cat   // mutate state
      render()                          // re-render manually
    })
  })

  rootEl.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      const event = currentEvents.find(e => String(e.id) === card.dataset.id)
      openModal(event)
    })
  })
}

// ─── modal ────────────────────────────────────────────────────────────────────
function openModal(event) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <button class="close-btn">✕</button>
      <h2>${event.subject}</h2>
      <p class="modal-date">${event.date} · ${event.category}</p>
      <p class="modal-content">${event.content}</p>
    </div>
  `
  document.body.appendChild(overlay)

  const close = () => overlay.remove()
  overlay.addEventListener('click', close)                        // click outside
  overlay.querySelector('.modal').addEventListener('click', e => e.stopPropagation())
  overlay.querySelector('.close-btn').addEventListener('click', close)
  document.addEventListener('keydown', function esc(ev) {
    if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', esc) }
  })
}

// ─── public API ───────────────────────────────────────────────────────────────
function renderTimeline(el, events) {
  rootEl         = el
  currentEvents  = events
  currentFilter  = 'All'
  render()
}

// CommonJS export (Node/bundler); browser script tag gets global renderTimeline
if (typeof module !== 'undefined') module.exports = { renderTimeline }
