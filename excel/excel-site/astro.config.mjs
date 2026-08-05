import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import solid from '@astrojs/solid-js'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(siteRoot, '../..')

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/einfach-excel' : '',
  integrations: [solid()],
  vite: {
    plugins: [wasm(), topLevelAwait()],
    resolve: {
      alias: {
        '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
        '@einfach/excel-core-ts': path.resolve(repoRoot, 'excel/excel-core-ts/src'),
        '@einfach/solid-excel/vnext-worker-factory': path.resolve(
          repoRoot,
          'excel/solid-excel/src-vnext/adapter/worker-factory.ts',
        ),
        '@einfach/solid-excel/vnext-styles.css': path.resolve(
          repoRoot,
          'excel/solid-excel/src-vnext/styles/index.css',
        ),
      },
      dedupe: ['solid-js'],
    },
    optimizeDeps: {
      exclude: ['@einfach/solid-excel'],
    },
    server: {
      fs: {
        allow: [repoRoot],
      },
    },
    build: {
      target: 'esnext',
      cssCodeSplit: false,
    },
  },
})
