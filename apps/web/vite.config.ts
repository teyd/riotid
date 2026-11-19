import { fileURLToPath } from 'node:url'

import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { varlockVitePlugin } from '@varlock/vite-integration'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const apiPort = Number(process.env.PORT ?? 8787)
const webPort = Number(process.env.WEB_PORT ?? 5173)

export default defineConfig({
  plugins: [
    varlockVitePlugin({ rootDir: repoRoot }),
    tanstackRouter(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/healthz': `http://localhost:${apiPort}`,
    },
  },
})
