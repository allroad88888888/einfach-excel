import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vitest/config'

const directory = path.dirname(fileURLToPath(import.meta.url))

/** Runs react-excel unit and component tests against source modules. */
export default defineConfig({
  plugins: [react(), lingui({ cwd: directory, macroTransform: true, failOnMissing: 'catalog', failOnCompileError: true })],
  resolve: {
    alias: {
      '@einfach/canvas-cells': path.resolve(directory, '../../packages/canvas-cells/src'),
      '@einfach/canvas': path.resolve(directory, '../../packages/canvas/src'),
      '@einfach/react-cells': path.resolve(directory, '../../packages/react-cells/src'),
      '@einfach/spreadsheet-ui-core': path.resolve(directory, '../spreadsheet-ui-core/src'),
    },
  },
  test: {
    environment: 'jsdom',
    // 组件测试会渲染整本工作簿（约 5000 个 DOM 元素），Testing Library 的 role/label 查询
    // 在 jsdom 里一次要几十毫秒；空闲时单测 <1s，并发争抢 CPU 时会被拖到 5s 默认上限之外。
    testTimeout: 15_000,
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup-vitest.ts'],
  },
})
