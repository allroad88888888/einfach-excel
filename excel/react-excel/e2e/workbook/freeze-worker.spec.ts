import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 原生协议验收；冻结菜单、固定区域布局及命中测试仍需要独立 UI E2E。
test('real Rust Worker freezes two axes, undoes structure and preserves sheet-local metadata', async ({
  page,
}) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const { createRustWorkbookConnection } = await import(`${url}rust-workbook/commands.ts`)
    const { default: RuntimeWorker } = await import(`${url}rust-runtime.ts?worker`)
    const connection = createRustWorkbookConnection(() => new RuntimeWorker())
    const projection = {
      kind: 'visible-window',
      sheetId: 's',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 },
    }
    try {
      await connection.request('workbook.initialize', {
        sheets: [
          { id: 's', name: 'Sheet', rowCount: 100, colCount: 8 },
          { id: 'other', name: 'Other', rowCount: 100, colCount: 8 },
        ],
      })
      await connection.request('workbook.importCells', {
        cells: [
          { sheet: 0, row: 0, col: 0, kind: 'number', value: 12 },
          { sheet: 0, row: 0, col: 1, kind: 'formula', value: '=A1*2' },
        ],
      })
      const frozen = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 3,
        cols: 2,
        projection,
      })
      const unchanged = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 3,
        cols: 2,
        projection,
      })
      const other = await connection.request('projection.readVisible', {
        request: { ...projection, sheetId: 'other' },
      })
      let invalid = ''
      try {
        await connection.request('sheet.freeze', { sheetId: 's', rows: 100, cols: 0, projection })
      } catch (error) {
        invalid = (error as Error).message
      }
      const shifted = await connection.request('sheet.editStructure', {
        sheetId: 's',
        edit: { action: 'insert-rows', at: 1, count: 2 },
        projection,
      })
      const undoShift = await connection.request('history.apply', { direction: 'undo', projection })
      const undoFreeze = await connection.request('history.apply', {
        direction: 'undo',
        projection,
      })
      const redoFreeze = await connection.request('history.apply', {
        direction: 'redo',
        projection,
      })
      const unfreeze = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 0,
        cols: 0,
        projection,
      })
      return {
        frozen,
        unchanged,
        other,
        invalid,
        shifted,
        undoShift,
        undoFreeze,
        redoFreeze,
        unfreeze,
      }
    } finally {
      connection.dispose()
    }
  }, coreUrl)
  expect(result.frozen.projection.freeze).toEqual({ rows: 3, cols: 2 })
  expect(result.frozen.projection.history.undoCount).toBe(1)
  expect(result.frozen.projection.cells).toContainEqual(
    expect.objectContaining({ row: 0, col: 1, displayValue: '24' }),
  )
  expect(result.unchanged.changed).toBe(false)
  expect(result.unchanged.projection.revision).toBe(result.frozen.projection.revision)
  expect(result.other.freeze).toEqual({ rows: 0, cols: 0 })
  expect(result.invalid).toContain('outside the worksheet')
  expect(result.shifted.projection.freeze).toEqual({ rows: 5, cols: 2 })
  expect(result.undoShift.projection.freeze).toEqual({ rows: 3, cols: 2 })
  expect(result.undoFreeze.projection.freeze).toEqual({ rows: 0, cols: 0 })
  expect(result.redoFreeze.projection.freeze).toEqual({ rows: 3, cols: 2 })
  expect(result.unfreeze.projection.freeze).toEqual({ rows: 0, cols: 0 })
})
