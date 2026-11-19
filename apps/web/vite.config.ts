import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { varlockVitePlugin } from '@varlock/vite-integration'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [varlockVitePlugin({ rootDir: repoRoot }), tanstackRouter(), react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/healthz': 'http://localhost:8787',
    },
  },
})
