import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const API_TARGET = process.env.VITE_API_BASE_URL?.replace(/\/api\/v1\/?$/, '') ?? 'http://127.0.0.1:8000'

/** Prints a clear startup banner once Vite's dev server is actually listening. */
function startupBanner(): Plugin {
  return {
    name: 'dineiq-startup-banner',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const lines = [
          'DineIQ Web - starting up',
          '',
          `  Local Web App    http://localhost:5173`,
          `  API Target       ${API_TARGET}`,
        ]
        const width = Math.max(...lines.map((l) => l.length)) + 4
        console.log('+' + '-'.repeat(width) + '+')
        for (const line of lines) console.log('|  ' + line.padEnd(width - 2) + '|')
        console.log('+' + '-'.repeat(width) + '+')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), startupBanner()],
  server: { port: 5173, strictPort: true },
})
