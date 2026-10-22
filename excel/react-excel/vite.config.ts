import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vite'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  plugins: [react(), lingui({ cwd: dirName, macroTransform: true, failOnMissing: 'catalog', failOnCompileError: true })],
  resolve: {
    alias: {
      '@einfach/canvas-cells': path.resolve(repoRoot, 'packages/canvas-cells/src'),
      '@einfach/canvas': path.resolve(repoRoot, 'packages/canvas/src'),
      '@einfach/react-cells': path.resolve(repoRoot, 'packages/react-cells/src'),
      '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist-demo',
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
