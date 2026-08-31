import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import solid from '@astrojs/solid-js'
import vue from '@astrojs/vue'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(siteRoot, '../..')
const reactSources = [
  path.resolve(siteRoot, 'src/islands/ReactAdapterDemoIsland.tsx'),
  path.resolve(repoRoot, 'excel/react-excel/src/**'),
]

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/einfach-excel' : '',
  integrations: [solid({ exclude: reactSources }), react({ include: reactSources }), vue()],
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
