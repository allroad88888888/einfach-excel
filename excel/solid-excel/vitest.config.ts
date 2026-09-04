import path from 'node:path'
import { fileURLToPath } from 'node:url'
import solidPlugin from 'vite-plugin-solid'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vitest/config'

const packageRoot = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(packageRoot, '../..')
const include = process.env.EINFACH_PERF === '1'
  ? ['test/**/*.bench.ts']
  : [
      'test/**/*.test.{ts,tsx}',
      'vanilla-readonly-poc/test/**/*.test.ts',
    ]

/** Reuses the production Solid/Vite transforms for unit and integration tests. */
export default defineConfig({
  plugins: [wasm(), topLevelAwait(), solidPlugin({ hot: false })],
  resolve: {
    dedupe: ['solid-js'],
    conditions: ['development', 'browser'],
    alias: {
      '@einfach/spreadsheet-ui-core': path.resolve(
        repositoryRoot,
        'excel/spreadsheet-ui-core/src',
      ),
      '@einfach/excel-core-ts': path.resolve(repositoryRoot, 'excel/excel-core-ts/src'),
    },
  },
  test: {
    name: 'solid-excel',
    environment: 'jsdom',
    include,
  },
})
