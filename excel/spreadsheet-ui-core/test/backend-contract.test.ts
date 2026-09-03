import { describe, expect, test } from '@jest/globals'
import {
  createRangeProjectionRequest,
  createVisibleProjectionRequest,
  type BackendMutationResult,
  type RangeProjectionRequest,
  type RangeProjectionResult,
  type RangeTsvExportRequest,
  type RangeTsvExportResult,
  type SetCellInputRequest,
  type SetColumnWidthRequest,
  type SetRowHeightRequest,
  validateProjectionResult,
  type ViewportSizeProjectionRequest,
  type ViewportSizeProjectionResult,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'

interface WorkbookOperationPorts {
  readVisibleProjection(request: VisibleProjectionRequest): Promise<VisibleProjectionResult>
  readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult>
  exportRangeTsv(request: RangeTsvExportRequest): Promise<RangeTsvExportResult>
  readViewportSizeProjection(
    request: ViewportSizeProjectionRequest,
  ): Promise<ViewportSizeProjectionResult>
  setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult>
  setRowHeight(request: SetRowHeightRequest): Promise<BackendMutationResult>
  setColumnWidth(request: SetColumnWidthRequest): Promise<BackendMutationResult>
}

describe('workbook operation contracts', () => {
  test('uses visible-window and explicit range ports without exposing workbook facts', async () => {
    const ports: WorkbookOperationPorts = {
      async readVisibleProjection(request) {
        return {
          kind: 'visible-window',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r1',
          window: request.window,
          cells: [
            {
              row: request.window.rowStart,
              col: request.window.colStart,
              displayValue: '1',
            },
          ],
        }
      },
      async readRangeProjection(request) {
        return {
          kind: 'range',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r1',
          range: request.range,
          cells: [{ row: request.range.rowStart, col: request.range.colStart, displayValue: 'A' }],
        }
      },
      async exportRangeTsv(request) {
        return {
          kind: 'range-tsv',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r5',
          range: request.range,
          originAddr: 'B2',
          text: 'A\tB\nC\tD',
          estimatedBytes: 7,
        }
      },
      async readViewportSizeProjection(request) {
        return {
          kind: 'viewport-size',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r1',
          window: request.window,
          rowHeights: [{ rowIndex: request.window.rowStart, heightPx: 32 }],
          colWidths: [{ colIndex: request.window.colStart, widthPx: 128 }],
        }
      },
      async setCellInput(request) {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r2',
          affectedRange: {
            rowStart: request.row,
            rowEnd: request.row,
            colStart: request.col,
            colEnd: request.col,
          },
        }
      },
      async setRowHeight(request) {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r3',
        }
      },
      async setColumnWidth(request) {
        return {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 'r4',
        }
      },
    }

    const visibleRequest = createVisibleProjectionRequest({
      sheetId: 'sheet-1',
      requestId: 7,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 2 },
    })
    const rangeRequest = createRangeProjectionRequest({
      sheetId: 'sheet-1',
      requestId: 8,
      reason: 'selection',
      range: { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 1 },
    })

    const visibleResult = await ports.readVisibleProjection(visibleRequest)
    const rangeResult = await ports.readRangeProjection(rangeRequest)
    const sizeResult = await ports.readViewportSizeProjection({
      kind: 'viewport-size',
      sheetId: 'sheet-1',
      requestId: 10,
      window: { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 },
    })
    const tsvResult = await ports.exportRangeTsv({
      kind: 'export-range-tsv',
      sheetId: 'sheet-1',
      requestId: 13,
      range: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
    })
    const mutationResult = await ports.setCellInput({
      kind: 'set-cell-input',
      sheetId: 'sheet-1',
      requestId: 9,
      row: 2,
      col: 1,
      input: '=A1+1',
    })
    const rowHeightResult = await ports.setRowHeight({
      kind: 'set-row-height',
      sheetId: 'sheet-1',
      requestId: 11,
      rowIndex: 2,
      heightPx: 32,
    })
    const columnWidthResult = await ports.setColumnWidth({
      kind: 'set-column-width',
      sheetId: 'sheet-1',
      requestId: 12,
      colIndex: 1,
      widthPx: 128,
    })

    expect(validateProjectionResult(visibleResult, { request: visibleRequest })).toEqual({
      ok: true,
      cellCount: 15,
    })
    expect(validateProjectionResult(rangeResult, { request: rangeRequest })).toEqual({
      ok: true,
      cellCount: 2,
    })
    expect(mutationResult).toMatchObject({
      sheetId: 'sheet-1',
      requestId: 9,
      revision: 'r2',
      affectedRange: { rowStart: 2, rowEnd: 2, colStart: 1, colEnd: 1 },
    })
    expect(sizeResult).toMatchObject({
      kind: 'viewport-size',
      sheetId: 'sheet-1',
      requestId: 10,
      rowHeights: [{ rowIndex: 2, heightPx: 32 }],
      colWidths: [{ colIndex: 1, widthPx: 128 }],
    })
    expect(tsvResult).toMatchObject({
      kind: 'range-tsv',
      sheetId: 'sheet-1',
      requestId: 13,
      revision: 'r5',
      range: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
      originAddr: 'B2',
      text: 'A\tB\nC\tD',
      estimatedBytes: 7,
    })
    expect(rowHeightResult).toMatchObject({
      sheetId: 'sheet-1',
      requestId: 11,
      revision: 'r3',
    })
    expect(columnWidthResult).toMatchObject({
      sheetId: 'sheet-1',
      requestId: 12,
      revision: 'r4',
    })
  })
})
