import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))

/** Runs react-excel unit and component tests against source modules. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
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
