import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 此文件只验证真实 Worker/WASM；数字格式弹窗仍需独立 UI 验收。
test('native format preview reads actual values without changing projection or history', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (coreUrl) => {
    const { createRustWorkbookConnection } = await import(`${coreUrl}rust-workbook/commands.ts`)
    const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
    const connection = createRustWorkbookConnection(() => new RuntimeWorker())
    try {
      await connection.request('workbook.initialize', { sheets: [{ id: 's', name: 'Sheet' }] })
      await connection.request('workbook.importCells', { cells: [
        { sheet: 0, row: 0, col: 0, kind: 'formula', value: '=2+0.5' },
        { sheet: 0, row: 1, col: 0, kind: 'text', value: '00123' },
        { sheet: 0, row: 2, col: 0, kind: 'boolean', value: true },
        { sheet: 0, row: 3, col: 0, kind: 'formula', value: '=1/0' },
      ] })
      const request = { kind: 'visible-window', sheetId: 's', requestId: 1,
        window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 1 } }
      const before = await connection.request('projection.readVisible', { request })
      const values = []
      for (const [addr, numberFormat] of [
        ['A1', { kind: 'date', pattern: 'dd-mmm-yy' }],
        ['A1', { kind: 'time', pattern: '[h]:mm:ss' }],
        ['A1', { kind: 'number', digits: 3 }],
        ['A1', { kind: 'currency', digits: 2, symbol: '€' }],
        ['A1', { kind: 'text' }], ['A2', { kind: 'number' }],
        ['A3', { kind: 'percent' }], ['A4', { kind: 'date' }], ['A5', { kind: 'date' }],
      ]) values.push(await connection.request('format.preview', { sheetId: 's', addr, numberFormat }))
      const errors = []
      for (const addr of ['A0', 'XFE1', 'A1048577']) {
        try { await connection.request('format.preview', { sheetId: 's', addr, numberFormat: { kind: 'text' } }) }
        catch (error) { errors.push((error as Error).message) }
      }
      return { before, after: await connection.request('projection.readVisible', { request }), values, errors }
    } finally { connection.dispose() }
  }, coreUrl)
  expect(result.values).toEqual(['02-Jan-00', '60:00:00', '2.500', '€2.50', '2.5', '00123', 'TRUE', '#DIV/0!', ''])
  expect(result.after).toEqual(result.before)
  expect(result.after.history.undoCount).toBe(0)
  expect(result.errors).toEqual(['INVALID_ADDRESS', 'INVALID_ADDRESS', 'INVALID_ADDRESS'])
})

test('text column preserves edits and external paste with one native undo', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (coreUrl) => {
    const { createRustWorkbookConnection } = await import(`${coreUrl}rust-workbook/commands.ts`)
    const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
    const connection = createRustWorkbookConnection(() => new RuntimeWorker())
    const range = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 }
    const projection = { kind: 'visible-window', sheetId: 's', requestId: 1, window: range }
    try {
      await connection.request('workbook.initialize', {
        sheets: [{ id: 's', name: 'Sheet', rowCount: 1000, colCount: 8 }],
      })
      await connection.request('format.setRange', { request: {
        sheetId: 's', requestId: 1, range: { ...range, colEnd: 0 }, scope: 'column', writeMode: 'patch',
        format: { numberFormat: { kind: 'text' } },
      }, projection })
      const edited = await connection.request('cell.setInput', { request: {
        sheetId: 's', requestId: 2, row: 0, col: 0, input: '00123',
      }, projection })
      const pasted = await connection.request('clipboard.paste', { request: {
        sheetId: 's', requestId: 3, row: 1, col: 0, text: '12345678901234567890\t00123\n=SUM(\t=2+3',
        rowCount: 1000, colCount: 8, mode: 'all',
      }, projection })
      const undo = await connection.request('history.apply', { direction: 'undo', projection })
      const redo = await connection.request('history.apply', { direction: 'redo', projection })
      return { edited, pasted, undo, redo }
    } finally { connection.dispose() }
  }, coreUrl)
  expect(result.edited.projection.cells).toContainEqual(expect.objectContaining({
    row: 0, col: 0, displayValue: '00123', valueKind: 'string',
  }))
  for (const [row, col, displayValue, valueKind] of [
    [1, 0, '12345678901234567890', 'string'], [1, 1, '123', 'number'],
    [2, 0, '=SUM(', 'string'], [2, 1, '5', 'number'],
  ]) expect(result.pasted.projection.cells).toContainEqual(expect.objectContaining({ row, col, displayValue, valueKind }))
  expect(result.pasted.projection.history.undoCount).toBe(result.edited.projection.history.undoCount + 1)
  expect(result.undo.projection.cells).not.toContainEqual(expect.objectContaining({ displayValue: '12345678901234567890' }))
  expect(result.undo.projection.cells).toContainEqual(expect.objectContaining({ row: 0, col: 0, displayValue: '00123' }))
  expect(result.redo.projection.cells).toEqual(result.pasted.projection.cells)
})
