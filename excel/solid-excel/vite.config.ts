import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  // Order matters: wasm() rewrites .wasm imports, then solidPlugin transforms
  // .tsx, then topLevelAwait() rewrites the resulting top-level `await`s into
  // an async IIFE so the bundle is loadable on browsers without TLA support.
  plugins: [wasm(), topLevelAwait(), solidPlugin()],
  resolve: {
    alias: {
      '@einfach/spreadsheet-ui-core': path.resolve(
        repoRoot,
        'excel/spreadsheet-ui-core/src',
      ),
      // Mirrors the jest moduleNameMapper so the bundled worker resolves
      // excel-core-ts straight from source. Otherwise vite would pick up the
      // stale published esm/cjs outputs and ?backend=ts would crash when the
      // worker calls debug RPCs added in Phase 1.
      '@einfach/excel-core-ts': path.resolve(repoRoot, 'excel/excel-core-ts/src'),
      // @einfach/core 与 @einfach/solid 不再 alias 到源码:拆仓后它们是
      // npm 依赖,由 node_modules 解析已发布的产物。原先指向 core/core/src
      // 与 core/solid/src 的 alias 在本仓是死路径,会让 dev server 报
      // "Failed to resolve import" 并且永远起不来。
    },
  },
  build: {
    target: 'esnext',
  },
})
