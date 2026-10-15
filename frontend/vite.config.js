import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev: forward API calls (including the SSE stream) to Spring Boot
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
