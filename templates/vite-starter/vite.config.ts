import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
  // 0.1.0 的 @lingui/core CJS 传递依赖在 dev 下需要预打包,否则白屏(build 不受影响)。
  optimizeDeps: {
    include: [
      '@einfach/solid-excel > @lingui/core',
      '@einfach/solid-excel > @lingui/core > @messageformat/parser',
    ],
  },
})
