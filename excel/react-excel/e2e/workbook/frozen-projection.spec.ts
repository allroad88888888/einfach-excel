import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 验证真实 WASM 多区域投影；不代替冻结窗格的 DOM 布局验收。
test('frozen strips return formulas, styles and off-window merge anchors in the mutation response', async ({
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
      window: { rowStart: 100, rowEnd: 110, colStart: 20, colEnd: 25 },
      viewport: { height: 280, width: 600, rowHeight: 28, colWidth: 120 },
    }
    try {
      await connection.request('workbook.initialize', {
        sheets: [
          {
            id: 's',
            name: 'Sheet',
            rowCount: 1_048_576,
            colCount: 16_384,
            rowHeights: [{ rowIndex: 0, heightPx: 56 }],
            mergedRanges: [{ rowStart: 0, rowEnd: 1, colStart: 19, colEnd: 21 }],
          },
        ],
      })
      await connection.request('workbook.importCells', {
        cells: [
          {
            sheet: 0,
            row: 0,
            col: 19,
            kind: 'text',
            value: 'Merged heading',
            format: { bold: true },
          },
          { sheet: 0, row: 0, col: 22, kind: 'number', value: 7, format: { italic: true } },
          { sheet: 0, row: 1, col: 22, kind: 'formula', value: '=W1*3' },
          { sheet: 0, row: 100, col: 0, kind: 'text', value: 'Left' },
          { sheet: 0, row: 100, col: 20, kind: 'text', value: 'Body' },
        ],
      })
      const frozen = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 2,
        cols: 1,
        projection,
      })
      const edited = await connection.request('cell.setInput', {
        request: {
          kind: 'set-cell-input',
          sheetId: 's',
          requestId: 2,
          row: 0,
          col: 22,
          input: '9',
        },
        projection: { ...projection, requestId: 2 },
      })
      const hidden = await connection.request('range.visibility', {
        sheetId: 's',
        range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 29 },
        action: 'hide-rows',
        projection: { ...projection, requestId: 3 },
      })
      const undo = await connection.request('history.apply', {
        direction: 'undo',
        projection: { ...projection, requestId: 4 },
      })
      const huge = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 1_000_000,
        cols: 16_000,
        projection: { ...projection, requestId: 5 },
      })
      const unfreeze = await connection.request('sheet.freeze', {
        sheetId: 's',
        rows: 0,
        cols: 0,
        projection: { ...projection, requestId: 6 },
      })
      return { frozen, edited, hidden, undo, huge, unfreeze }
    } finally {
      connection.dispose()
    }
  }, coreUrl)
  const top = result.frozen.projection.frozen.regions.find(
    (region: { pane: string }) => region.pane === 'top',
  )
  expect(result.frozen.projection.frozen).toMatchObject({ height: 84, width: 120 })
  expect(top.cells).toContainEqual(
    expect.objectContaining({
      row: 0,
      col: 22,
      displayValue: '7',
      format: expect.objectContaining({ italic: true }),
    }),
  )
  expect(top.cells).toContainEqual(
    expect.objectContaining({ row: 1, col: 22, displayValue: '21', formula: '=W1*3' }),
  )
  expect(top.mergeAnchors).toContainEqual(
    expect.objectContaining({
      row: 0,
      col: 19,
      displayValue: 'Merged heading',
      mergedSpan: { rows: 2, cols: 3 },
    }),
  )
  expect(result.frozen.projection.cells).toContainEqual(
    expect.objectContaining({ row: 100, col: 20, displayValue: 'Body' }),
  )
  expect(result.frozen.projection.cells.every((cell: { row: number }) => cell.row >= 100)).toBe(
    true,
  )
  const editedCells = result.edited.projection.frozen.regions.flatMap(
    (region: { cells: unknown[] }) => region.cells,
  )
  expect(editedCells).toContainEqual(
    expect.objectContaining({ row: 1, col: 22, displayValue: '27' }),
  )
  expect(result.hidden.projection.frozen.height).toBe(28)
  expect(
    result.hidden.projection.frozen.regions.find(
      (region: { pane: string }) => region.pane === 'top',
    ).window.rowStart,
  ).toBe(1)
  expect(result.undo.projection.frozen.height).toBe(84)
  expect(result.huge.projection.frozen.regions).toHaveLength(1)
  expect(result.huge.projection.frozen.regions[0].window).toEqual({
    rowStart: 0,
    rowEnd: 8,
    colStart: 0,
    colEnd: 4,
  })
  expect(result.unfreeze.projection.frozen).toEqual({ height: 0, width: 0, regions: [] })
})
