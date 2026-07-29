import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  // Order matters: wasm() rewrites .wasm imports, then solidPlugin transforms
  // .tsx, then topLevelAwait() rewrites the resulting top-level `await`s into
  // an async IIFE so the bundle is loadable on browsers without TLA support.
  plugins: [wasm(), topLevelAwait(), solidPlugin()],
  resolve: {
    alias: {
      '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
      '@einfach/excel-core-ts': path.resolve(repoRoot, 'excel/excel-core-ts/src'),
      // @einfach/core 与 @einfach/solid 不再 alias 到源码:拆仓后它们是
      // npm 依赖,由 node_modules 解析已发布的产物。原先指向 core 包本地
      // 源码目录的 alias 在本仓是死路径,会让 dev server 报
      // "Failed to resolve import" 并且永远起不来。
      //
      // Dedupe @lingui/core against the workspace hoist so solid-excel's
      // linked-source imports resolve the same module instance as this
      // package's own dependency, matching the showcase config's hack.
      '@lingui/core': path.resolve(dirName, 'node_modules/@lingui/core'),
    },
  },
  // solid-excel is consumed as linked source so its worker `new URL(...)`
  // modules must be bundled from source, not prebundled.
  optimizeDeps: {
    exclude: ['@einfach/solid-excel'],
  },
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    // WASM + top-level-await requirement.
    target: 'esnext',
  },
})
