import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import demoConfig from './vite.config'

const dirName = path.dirname(fileURLToPath(import.meta.url))
const e2eDir = path.join(dirName, 'e2e')

/** The demo plus every e2e host page, so browser acceptance runs the bundle users get. */
const pages = [
  path.join(dirName, 'index.html'),
  ...readdirSync(e2eDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.html'))
    .map((file) => path.join(e2eDir, file)),
]

export default mergeConfig(demoConfig, {
  build: {
    outDir: 'dist-e2e',
    // 失败时的堆栈与 trace 仍能回到源码；页面本身不加载 map。
    sourcemap: true,
    chunkSizeWarningLimit: 8_000,
    rollupOptions: { input: pages },
  },
})
