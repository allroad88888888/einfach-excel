import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@einfach\/canvas$/, replacement: fileURLToPath(new URL('../canvas/src/index.ts', import.meta.url)) },
    ],
  },
})
