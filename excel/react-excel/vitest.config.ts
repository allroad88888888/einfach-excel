import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))

/** Runs react-excel unit and component tests against source modules. */
export default defineConfig({
  plugins: [react(), lingui({ cwd: directory, macroTransform: true, failOnMissing: 'catalog', failOnCompileError: true })],
  resolve: {
    alias: {
      '@einfach/canvas-cells': path.resolve(directory, '../../packages/canvas-cells/src'),
      '@einfach/canvas': path.resolve(directory, '../../packages/canvas/src'),
      '@einfach/react-cells': path.resolve(directory, '../../packages/react-cells/src'),
      '@einfach/spreadsheet-ui-core': path.resolve(directory, '../spreadsheet-ui-core/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup-vitest.ts'],
  },
})
