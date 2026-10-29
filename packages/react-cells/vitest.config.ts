import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@einfach-excel/spreadsheet-ui-core': path.resolve(directory, '../../excel/spreadsheet-ui-core/src'),
    },
  },
  test: {
    name: 'react-cells', environment: 'jsdom', globals: true,
    include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['./test/setup.ts'],
  },
})
