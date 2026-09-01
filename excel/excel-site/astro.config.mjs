import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import solid from '@astrojs/solid-js'
import vue from '@astrojs/vue'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(siteRoot, '../..')

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/einfach-excel' : '',
  integrations: [solid(), vue()],
  vite: {
    plugins: [wasm(), topLevelAwait()],
    resolve: {
      alias: {
        '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
        '@einfach/excel-core-ts': path.resolve(repoRoot, 'excel/excel-core-ts/src'),
        '@einfach/solid-excel/worker-factory': path.resolve(
          repoRoot,
          'excel/solid-excel/src/adapter/worker-factory.ts',
        ),
        '@einfach/spreadsheet-ui-styles/styles.css': path.resolve(
          repoRoot,
          'excel/spreadsheet-ui-styles/styles/index.css',
        ),
      },
      dedupe: ['solid-js'],
    },
    optimizeDeps: {
      exclude: ['@einfach/solid-excel', '@einfach/solid-excel/worker-factory'],
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
