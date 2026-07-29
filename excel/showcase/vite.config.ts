import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      '@einfach/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
      // @einfach/core 与 @einfach/solid 走 node_modules(npm 依赖),不再
      // alias 到源码 —— 拆仓后 core/ 不在本仓,原 alias 是死路径。
      '@lingui/core': path.resolve(dirName, 'node_modules/@lingui/core'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
  },
})
