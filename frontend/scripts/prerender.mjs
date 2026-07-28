// Pre-render static routes to real HTML so the browser paints content on
// first byte instead of a blank #root (kills the CSR flash). Uses the
// Playwright chromium already installed for e2e — react-snap's bundled
// Chrome is too old to launch on this machine.
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const ROUTES = ['/']
const PORT = 45678

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2',
}

// Static file server over dist/ with SPA fallback to index.html.
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    let filePath = join(DIST, urlPath)
    if (!extname(filePath) || !existsSync(filePath)) filePath = join(DIST, 'index.html')
    const body = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})

await new Promise(r => server.listen(PORT, r))

const browser = await chromium.launch()
const page = await browser.newPage()

for (const route of ROUTES) {
  await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' })
  // Wait until React has actually mounted content into #root.
  await page.waitForFunction(() => {
    const r = document.getElementById('root')
    return r && r.childElementCount > 0
  }, { timeout: 15000 })

  const html = await page.content()
  const out = route === '/' ? join(DIST, 'index.html') : join(DIST, route.slice(1), 'index.html')
  await writeFile(out, html)
  console.log(`✓ pre-rendered ${route} → ${out.replace(DIST, 'dist')}`)
}

await browser.close()
server.close()
