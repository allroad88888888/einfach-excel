import { defineWorkspace } from 'vitest/config'

/** Keeps each package's runtime-specific transforms while providing one root test command. */
export default defineWorkspace([
  'excel/excel-core-ts/vitest.config.ts',
  'excel/spreadsheet-ui-core/vitest.config.ts',
  'excel/react-excel/vitest.config.ts',
])
