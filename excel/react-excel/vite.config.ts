import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist',
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
