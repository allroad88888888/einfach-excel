import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { lingui } from '@lingui/vite-plugin'
import { defineConfig } from 'vite'

const directory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(directory, '../..')
const singletonPeers = [
  'react', 'react-dom', '@einfach/core', '@einfach/react', '@einfach/spreadsheet-ui-core',
]

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), lingui({
    cwd: directory, macroTransform: true, failOnMissing: 'catalog', failOnCompileError: true,
  })],
  resolve: {
    // 私有绘制实现内联；Core 使用发行入口并 external，保持宿主 atom 的单例身份。
    alias: {
      '@einfach/canvas-cells': path.resolve(repoRoot, 'packages/canvas-cells/src'),
      '@einfach/canvas': path.resolve(repoRoot, 'packages/canvas/src'),
      '@einfach/react-cells': path.resolve(repoRoot, 'packages/react-cells/src'),
    },
  },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'style' },
    rolldownOptions: {
      // ESM 库默认保留源码 region 标记；发行物不携带 .po/.tsx 源文件标记。
      output: { minify: true, comments: { annotation: true, legal: true, jsdoc: false } },
      external: (id) => singletonPeers.some((peer) => id === peer || id.startsWith(`${peer}/`))
        || /^@lingui\/(?:core|react)(?:\/|$)/.test(id),
    },
  },
})
