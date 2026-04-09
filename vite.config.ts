import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Forward /api/* to the wrangler `pages dev` server (Cloudflare Pages
  // Functions + local D1) so the SPA can call the backend at the same
  // origin during development. Cookies ride along cleanly because there's
  // no CORS hop. See plan.md Phase 7 for the full two-terminal workflow.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: false,
      },
    },
  },
})
