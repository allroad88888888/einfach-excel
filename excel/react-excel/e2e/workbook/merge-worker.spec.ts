import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const coreUrl = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/', import.meta.url))}`

// 真实浏览器 Worker/WASM 协议测试；不替代后续合并菜单、选区、编辑器的 UI E2E。
for (const action of ['merge', 'center'] as const) {
  test(`real Worker ${action}: confirmation, offscreen anchor, unmerge and native history`, async ({
    page,
  }) => {
    await page.goto('/')
    const result = await page.evaluate(
      async ({ coreUrl, action }) => {
        const { createRustWorkbookConnection } = await import(`${coreUrl}rust-workbook/commands.ts`)
        const { default: RuntimeWorker } = await import(`${coreUrl}rust-runtime.ts?worker`)
        const connection = createRustWorkbookConnection(() => new RuntimeWorker())
        const range = { rowStart: 0, rowEnd: 100, colStart: 0, colEnd: 10 }
        const projection = {
          kind: 'visible-window',
          sheetId: 's',
          requestId: 1,
          reason: 'test',
          window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
        }
        try {
          await connection.request('workbook.initialize', {
            sheets: [{ id: 's', name: 'Sheet', rowCount: 200, colCount: 30 }],
          })
          await connection.request('workbook.importCells', {
            cells: [
              {
                sheet: 0,
                row: 0,
                col: 0,
                kind: 'formula',
                value: '=1/4',
                format: {
                  bold: true,
                  numberFormat: { kind: 'percent', digits: 0 },
                },
              },
              { sheet: 0, row: 0, col: 1, kind: 'number', value: 8 },
            ],
          })
          const input = { sheetId: 's', range, action, discard: false, projection }
          let confirmation = ''
          try {
            await connection.request('range.merge', input)
          } catch (error) {
            confirmation = (error as Error).message
          }
          const before = await connection.request('projection.readVisible', { request: projection })
          const merged = await connection.request('range.merge', { ...input, discard: true })
          const offscreen = await connection.request('projection.readVisible', {
            request: {
              ...projection,
              requestId: 2,
              window: { rowStart: 50, rowEnd: 60, colStart: 5, colEnd: 8 },
            },
          })
          let coveredWrite = ''
          try {
            await connection.request('cell.setInput', {
              request: { sheetId: 's', row: 1, col: 1, input: 'hidden', requestId: 3 },
              projection,
            })
          } catch (error) {
            coveredWrite = (error as Error).message
          }
          const unmerged = await connection.request('range.merge', {
            ...input,
            action: 'unmerge',
            range: { rowStart: 50, rowEnd: 50, colStart: 5, colEnd: 5 },
          })
          const undoUnmerge = await connection.request('history.apply', {
            direction: 'undo',
            projection,
          })
          const undoMerge = await connection.request('history.apply', {
            direction: 'undo',
            projection,
          })
          const redoMerge = await connection.request('history.apply', {
            direction: 'redo',
            projection,
          })
          return {
            confirmation,
            before,
            merged,
            offscreen,
            coveredWrite,
            unmerged,
            undoUnmerge,
            undoMerge,
            redoMerge,
          }
        } finally {
          connection.dispose()
        }
      },
      { coreUrl, action },
    )
    expect(result.confirmation).toBe('MERGE_CONTENT_CONFIRMATION_REQUIRED')
    expect(result.before.history.undoCount).toBe(0)
    expect(result.before.cells).toContainEqual(
      expect.objectContaining({ row: 0, col: 1, displayValue: '8' }),
    )
    expect(result.merged.projection.history.undoCount).toBe(1)
    expect(result.merged.projection.cells).not.toContainEqual(
      expect.objectContaining({ row: 0, col: 1, displayValue: '8' }),
    )
    expect(result.offscreen.mergedRanges).toEqual([
      { rowStart: 0, rowEnd: 100, colStart: 0, colEnd: 10 },
    ])
    expect(result.offscreen.mergeAnchors).toMatchObject([
      {
        row: 0,
        col: 0,
        displayValue: '25%',
        formula: '=1/4',
        mergedSpan: { rows: 101, cols: 11 },
        format: { bold: true },
      },
    ])
    if (action === 'center') expect(result.offscreen.mergeAnchors[0].format.align).toBe('center')
    expect(result.coveredWrite).toBe('MERGED_CELL_WRITE')
    expect(result.unmerged.projection.mergedRanges).toEqual([])
    expect(result.unmerged.projection.history.undoCount).toBe(2)
    expect(result.undoUnmerge.projection.mergedRanges).toEqual(result.offscreen.mergedRanges)
    expect(result.undoMerge.projection.mergedRanges).toEqual([])
    expect(result.undoMerge.projection.cells).toContainEqual(
      expect.objectContaining({ row: 0, col: 1, displayValue: '8' }),
    )
    expect(result.redoMerge.projection.mergedRanges).toEqual(result.offscreen.mergedRanges)
  })
}
