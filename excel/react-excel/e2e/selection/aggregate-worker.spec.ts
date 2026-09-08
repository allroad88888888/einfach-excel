import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

test('real Rust aggregates sparse, overlapping, hidden and spill cells without viewport limits', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const { createRustWorkbookConnection } = await import(`${url}rust-workbook/commands.ts`)
    const { default: RuntimeWorker } = await import(`${url}rust-runtime.ts?worker`)
    const connection = createRustWorkbookConnection(() => new RuntimeWorker())
    try {
      await connection.request('workbook.initialize', { sheets: [
        { id: 's', name: 'Sheet', rowCount: 1_048_576, colCount: 8, hiddenRows: [999999] },
        { id: 'other', name: 'Other', rowCount: 100, colCount: 8 },
      ] })
      await connection.request('workbook.importCells', { cells: [
        { sheet: 0, row: 0, col: 0, kind: 'number', value: 10 },
        { sheet: 0, row: 999999, col: 0, kind: 'number', value: -4 },
        { sheet: 0, row: 1, col: 0, kind: 'text', value: '20' },
        { sheet: 0, row: 2, col: 0, kind: 'boolean', value: true },
        { sheet: 0, row: 3, col: 0, kind: 'formula', value: '=Other!A1*2' },
        { sheet: 1, row: 0, col: 0, kind: 'number', value: 3 },
        { sheet: 0, row: 0, col: 2, kind: 'number', value: Number.MAX_VALUE },
        { sheet: 0, row: 1, col: 2, kind: 'number', value: Number.MAX_VALUE },
        { sheet: 0, row: 0, col: 3, kind: 'formula', value: '=SEQUENCE(3)' },
      ] })
      const range = { rowStart: 0, rowEnd: 1_048_575, colStart: 0, colEnd: 0 }
      const targets = [{ sheetId: 's', range }, { sheetId: 's', range }, { sheetId: 'other', range }]
      const whole = await connection.request('selection.aggregate', { targets })
      const empty = await connection.request('selection.aggregate', {
        targets: [{ sheetId: 's', range: { ...range, colStart: 1, colEnd: 1 } }],
      })
      const overflow = await connection.request('selection.aggregate', {
        targets: [{ sheetId: 's', range: { ...range, colStart: 2, colEnd: 2 } }],
      })
      const spill = await connection.request('selection.aggregate', {
        targets: [{ sheetId: 's', range: { ...range, colStart: 3, colEnd: 3 } }],
      })
      let invalid = ''
      try {
        await connection.request('selection.aggregate', {
          targets: [{ sheetId: 's', range: { ...range, rowEnd: 0.5 } }],
        })
      } catch (error) { invalid = (error as Error).message }
      return { whole, empty, overflow, spill, invalid }
    } finally { connection.dispose() }
  }, coreUrl)
  expect(result.whole).toEqual({ count: 6, numericCount: 4, sum: 15, average: 3.75, min: -4, max: 10, revision: 0 })
  expect(result.empty).toEqual({ count: 0, numericCount: 0, sum: null, average: null, min: null, max: null, revision: 0 })
  expect(result.overflow).toEqual({ count: 2, numericCount: 2, sum: null, average: Number.MAX_VALUE,
    min: Number.MAX_VALUE, max: Number.MAX_VALUE, revision: 0 })
  expect(result.spill).toEqual({ count: 3, numericCount: 3, sum: 6, average: 2, min: 1, max: 3, revision: 0 })
  expect(result.invalid).not.toBe('')
})
