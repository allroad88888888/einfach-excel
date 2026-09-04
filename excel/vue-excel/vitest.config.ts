import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const uiCoreSource = path.resolve(packageRoot, '../spreadsheet-ui-core/src')

/** Runs the Vue adapter tests against package source. */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@einfach\/spreadsheet-ui-core$/,
        replacement: path.resolve(uiCoreSource, 'index.ts'),
      },
      {
        find: /^@einfach\/spreadsheet-ui-core\/(.*)$/,
        replacement: `${uiCoreSource}/$1`,
      },
      {
        find: '@einfach/vue-excel/pointer-selection',
        replacement: path.resolve(packageRoot, 'src/use-spreadsheet-pointer-selection.ts'),
      },
      {
        find: '@einfach/vue-excel',
        replacement: path.resolve(packageRoot, 'src/index.ts'),
      },
    ],
  },
  test: {
    name: 'vue-excel',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup-vitest.ts'],
  },
})
