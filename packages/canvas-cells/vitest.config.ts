import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@einfach-excel/canvas': path.resolve(directory, '../canvas/src/index.ts'),
      '@einfach-excel/spreadsheet-ui-core': path.resolve(directory, '../../excel/spreadsheet-ui-core/src'),
    },
  },
  test: {
    name: 'canvas-cells', environment: 'node', globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
