import { defineConfig } from 'vitest/config'

/** Runs the framework-agnostic UI Core test suite in its package boundary. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
})
