import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    define: {
      // Expose NEXT_PUBLIC_* vars to the browser bundle (same convention as Next.js)
      'process.env.NEXT_PUBLIC_API_URL':      JSON.stringify(env.NEXT_PUBLIC_API_URL      || 'http://localhost:20000'),
      'process.env.NEXT_PUBLIC_APP_URL':      JSON.stringify(env.NEXT_PUBLIC_APP_URL      || 'http://localhost:20001'),
      'process.env.NEXT_PUBLIC_MCP_URL':      JSON.stringify(env.NEXT_PUBLIC_MCP_URL      || 'https://api.probonoai.com.au/mcp'),
      'process.env.NEXT_PUBLIC_APP_NAME':     JSON.stringify(env.NEXT_PUBLIC_APP_NAME     || 'ProBono AI'),
      'process.env.NEXT_PUBLIC_APP_DOMAIN':   JSON.stringify(env.NEXT_PUBLIC_APP_DOMAIN   || 'probonoai.com.au'),
      'process.env.NEXT_PUBLIC_FEATURED_CASE':JSON.stringify(env.NEXT_PUBLIC_FEATURED_CASE|| 'R v Nguyen [2025]'),
    },
    build: {
      outDir: 'dist',
    },
    server: {
      port: 20001,
    },
  }
})
