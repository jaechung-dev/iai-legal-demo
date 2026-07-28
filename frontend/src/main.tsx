import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App'

const rootEl = document.getElementById('root')!
const app = (
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
)

// Only the landing route ("/") is pre-rendered, so only hydrate there. On any
// other route the baked-in markup is the wrong (landing) page — discard it and
// client-render cleanly to avoid hydration mismatches.
if (rootEl.hasChildNodes() && window.location.pathname === '/') {
  hydrateRoot(rootEl, app)
} else {
  rootEl.innerHTML = ''
  createRoot(rootEl).render(app)
}
// Reveal once React has taken over (see the boot gate in index.html).
document.documentElement.classList.remove('booting')
