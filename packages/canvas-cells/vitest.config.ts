import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@einfach/canvas': path.resolve(directory, '../canvas/src/index.ts'),
      '@einfach/spreadsheet-ui-core': path.resolve(directory, '../../excel/spreadsheet-ui-core/src'),
    },
  },
  test: {
    name: 'canvas-cells', environment: 'node', globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
})
