import { defineConfig, devices } from '@playwright/test'
import { execSync } from 'child_process'

// Read the API URL baked into the static export so test-runner API calls
// (loginAs, createMcpToken, etc.) use the same backend as the browser.
function getBakedApiUrl(): string {
  try {
    const chunk = execSync(
      'grep -rl "execute-api" out/_next/static/chunks/ 2>/dev/null | head -1',
      { cwd: __dirname }
    ).toString().trim()
    if (!chunk) return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'
    const content = execSync(`cat "${chunk}"`).toString()
    const m = content.match(/"(https?:\/\/[^"]+amazonaws\.com)"/)
    return m ? m[1] : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'
  } catch {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:20000'
  }
}

const API_URL = getBakedApiUrl()
// Always use the baked production URL when detected — .env.local localhost is for dev only
process.env.NEXT_PUBLIC_API_URL = API_URL
// MCP server — default to production unless overridden
if (!process.env.MCP_URL) process.env.MCP_URL = 'https://api.probonoai.com.au'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:20001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npx serve out -p 20001 --no-clipboard',
    url: 'http://localhost:20001',
    reuseExistingServer: true,
    timeout: 10000,
  },
})
