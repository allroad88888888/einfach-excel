import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import workbookConfig from '../../excel/react-excel/vitest.config'

const directory = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  ...workbookConfig,
  resolve: { alias: {
    ...workbookConfig.resolve?.alias,
    '@einfach-excel/react-excel': path.resolve(directory, '../../excel/react-excel/src'),
  } },
  test: {
    ...workbookConfig.test,
    name: 'plugin-data-sort', include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
})
