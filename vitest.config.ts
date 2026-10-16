import { defineConfig } from 'vitest/config'

/** Keeps each package's runtime-specific transforms while providing one root test command. */
export default defineConfig({
  test: {
    projects: [
      'packages/canvas/vitest.config.ts',
      'packages/react-cells/vitest.config.ts',
      'packages/canvas-cells/vitest.config.ts',
      'excel/excel-core-ts/vitest.config.ts',
      'excel/spreadsheet-ui-core/vitest.config.ts',
      'excel/react-excel/vitest.config.ts',
    ],
  },
})
