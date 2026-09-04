import { defineConfig } from 'vitest/config'

/** Runs the TypeScript formula engine tests without a browser environment. */
export default defineConfig({
  test: {
    name: 'excel-core-ts',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
