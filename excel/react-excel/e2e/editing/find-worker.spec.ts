import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 真实传输验收；查找面板、焦点、快捷键、结果导航仍须独立的 UI E2E。
for (const mode of ['all', 'current'] as const) {
  test(`real Worker replaces ${mode} across sparse offscreen data with one native undo`, async ({
    page,
  }) => {
    await page.goto('/')
    const result = await page.evaluate(
      async ({ coreUrl, mode }) => {
        const { createRustWorkbookConnection } = await import(`${coreUrl}rust-workbook/commands.ts`)
        const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
        const connection = createRustWorkbookConnection(() => new RuntimeWorker())
        const range = { rowStart: 0, colStart: 0, rowEnd: 1000, colEnd: 7 }
        const targets = [
          { sheetId: 's', range },
          { sheetId: 'other', range },
        ]
        const query = { needle: 'old', caseSensitive: false, wholeCell: false, lookIn: 'formulas' }
        const search = { targets, query, offset: 0, limit: 500 }
        const projection = {
          kind: 'visible-window',
          sheetId: 'other',
          requestId: 1,
          window: { rowStart: 995, rowEnd: 1000, colStart: 0, colEnd: 2 },
        }
        try {
          await connection.request('workbook.initialize', {
            sheets: [
              { id: 's', name: 'Sheet', rowCount: 1001, colCount: 8 },
              { id: 'other', name: 'Other', rowCount: 1001, colCount: 8 },
            ],
          })
          await connection.request('workbook.importCells', {
            cells: Array.from({ length: 600 }, (_, i) => ({
              sheet: Math.floor(i / 300),
              row: (i % 300) + 701,
              col: 0,
              kind: 'text',
              value: '😀old old',
            })),
          })
          const found = await connection.request('workbook.find', search)
          const last = await connection.request('workbook.find', { ...search, offset: 1199 })
          const input = {
            targets,
            query,
            replacement: 'new',
            expectedRevision: found.revision,
            projection,
            ...(mode === 'current' ? { current: last.matches[0] } : {}),
          }
          const replaced = await connection.request('workbook.replace', input)
          let stale = ''
          try {
            await connection.request('workbook.replace', input)
          } catch (error) {
            stale = (error as Error).message
          }
          const remaining = await connection.request('workbook.find', search)
          const undo = await connection.request('history.apply', { direction: 'undo', projection })
          const restored = await connection.request('workbook.find', search)
          const redo = await connection.request('history.apply', { direction: 'redo', projection })
          const noOp = await connection.request('workbook.replace', {
            targets,
            query: { ...query, needle: 'new' },
            replacement: 'new',
            expectedRevision: redo.projection.revision,
            projection,
          })
          return { found, last, replaced, stale, remaining, undo, restored, redo, noOp }
        } finally {
          connection.dispose()
        }
      },
      { coreUrl, mode },
    )
    expect(result.found.total).toBe(1200)
    expect(result.found.matches).toHaveLength(500)
    expect(result.last.matches).toEqual([{ sheetId: 'other', row: 1000, col: 0, start: 6, end: 9 }])
    expect(result.replaced.cells).toBe(mode === 'all' ? 600 : 1)
    expect(result.replaced.occurrences).toBe(mode === 'all' ? 1200 : 1)
    expect(result.replaced.projection.cells).toContainEqual(
      expect.objectContaining({
        row: 1000,
        col: 0,
        displayValue: mode === 'all' ? '😀new new' : '😀old new',
      }),
    )
    expect(result.replaced.projection.history.undoCount).toBe(1)
    expect(result.stale).toContain('workbook changed')
    expect(result.remaining.total).toBe(mode === 'all' ? 0 : 1199)
    expect(result.undo.projection.history.undoCount).toBe(0)
    expect(result.restored.total).toBe(1200)
    expect(result.redo.projection.history.undoCount).toBe(1)
    expect(result.noOp.cells).toBe(0)
    expect(result.noOp.projection.revision).toBe(result.redo.projection.revision)
    expect(result.noOp.projection.history.undoCount).toBe(1)
  })
}

test('real Worker rolls back a late invalid formula and accepts a corrected replacement', async ({
  page,
}) => {
  await page.goto('/')
  const result = await page.evaluate(async (coreUrl) => {
    const { createRustWorkbookConnection } = await import(`${coreUrl}rust-workbook/commands.ts`)
    const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
    const connection = createRustWorkbookConnection(() => new RuntimeWorker())
    const range = { rowStart: 0, colStart: 0, rowEnd: 5, colEnd: 2 }
    const query = { needle: 'SUM', caseSensitive: false, wholeCell: false, lookIn: 'formulas' }
    const targets = [{ sheetId: 's', range }]
    const projection = { kind: 'visible-window', sheetId: 's', requestId: 1, window: range }
    try {
      await connection.request('workbook.initialize', {
        sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8 }],
      })
      await connection.request('workbook.importCells', {
        cells: [
          { sheet: 0, row: 0, col: 0, kind: 'text', value: 'SUM' },
          { sheet: 0, row: 1, col: 0, kind: 'formula', value: '=SUM(1,2)' },
        ],
      })
      const input = { targets, query, replacement: '(', expectedRevision: 0, projection }
      let error = ''
      try {
        await connection.request('workbook.replace', input)
      } catch (caught) {
        error = (caught as Error).message
      }
      const failed = await connection.request('projection.readVisible', { request: projection })
      const corrected = await connection.request('workbook.replace', {
        ...input,
        replacement: 'MAX',
      })
      return { error, failed, corrected }
    } finally {
      connection.dispose()
    }
  }, coreUrl)
  expect(result.error).toBe('INVALID_FORMULA')
  expect(result.failed.revision).toBe(0)
  expect(result.failed.history.undoCount).toBe(0)
  expect(result.failed.cells).toContainEqual(
    expect.objectContaining({ row: 0, col: 0, displayValue: 'SUM' }),
  )
  expect(result.failed.cells).toContainEqual(
    expect.objectContaining({ row: 1, col: 0, displayValue: '3', formula: '=SUM(1,2)' }),
  )
  expect(result.corrected.cells).toBe(2)
  expect(result.corrected.projection.cells).toContainEqual(
    expect.objectContaining({ row: 1, col: 0, displayValue: '2', formula: '=MAX(1,2)' }),
  )
  expect(result.corrected.projection.history.undoCount).toBe(1)
})
