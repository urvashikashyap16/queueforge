// Builds a self-contained, backend-free demo of the dashboard as ONE html file
// (simulated jobs, hash routing). Useful for sharing a live preview link.
//   npm run build:demo   ->  dist-demo/index.html
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_FORCE_DEMO': JSON.stringify('true'),
    'import.meta.env.VITE_HASH_ROUTER': JSON.stringify('true'),
  },
  build: { outDir: 'dist-demo' },
})
