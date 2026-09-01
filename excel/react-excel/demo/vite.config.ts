import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: '../dist',
  },
  preview: {
    host: '127.0.0.1',
    port: 5183,
  },
  server: {
    host: '127.0.0.1',
    port: 5183,
  },
})
