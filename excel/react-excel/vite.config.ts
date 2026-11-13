import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vite'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirName, '../..')

export default defineConfig({
  plugins: [react(), lingui({ cwd: dirName, macroTransform: true, failOnMissing: 'catalog', failOnCompileError: true })],
  resolve: {
    alias: {
      // 插件消费公开根入口时复用演示页的 React context，不能再载入 dist 副本。
      '@einfach-excel/react-excel': path.resolve(dirName, 'src'),
      '@einfach-excel/canvas-cells': path.resolve(repoRoot, 'packages/canvas-cells/src'),
      '@einfach-excel/canvas': path.resolve(repoRoot, 'packages/canvas/src'),
      '@einfach-excel/react-cells': path.resolve(repoRoot, 'packages/react-cells/src'),
      '@einfach-excel/spreadsheet-ui-core': path.resolve(repoRoot, 'excel/spreadsheet-ui-core/src'),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist-demo',
  },
  preview: {
    host: '127.0.0.1',
    port: 5183,
  },
  server: {
    host: '127.0.0.1',
    port: 5183,
  },
})
