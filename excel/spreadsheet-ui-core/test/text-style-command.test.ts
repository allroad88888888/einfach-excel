import { describe, expect, test } from 'vitest'
import {
  createSpreadsheetUi,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectColumnsAtom,
  selectRowsAtom,
  setSelectionBoundsAtom,
  applySelectionFormatAtom,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

const window = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 }

function projection(
  request: VisibleProjectionRequest,
  format: SpreadsheetCellFormat,
  revision = 1,
): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: request.window,
    cells: [{ row: 1, col: 2, displayValue: 'Northwind', format }],
  }
}

describe('selection text style command', () => {
  test('toggles bold, italic and underline through one Rust range command', async () => {
    let format: SpreadsheetCellFormat = {}
    let revision = 1
    const writes: SetFormatRangeRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request) {
        return projection(request, format, revision)
      },
      async setRangeFormat(request, projectionRequest) {
        writes.push(request)
        format = { ...format, ...(request.format ?? {}) }
        for (const field of request.clearFormatFields ?? []) delete format[field]
        revision += 1
        return {
          acknowledgement: {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision,
            affectedRange: request.range,
          },
          projection: projection(projectionRequest, format, revision),
        }
      },
    })
    const core = createSpreadsheetUi({ connection })
    core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 2 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window,
      reason: 'viewport',
    })

    await expect(core.store.setter(applySelectionFormatAtom, 'bold')).resolves.toBe('completed')
    await expect(core.store.setter(applySelectionFormatAtom, 'italic')).resolves.toBe('completed')
    await expect(core.store.setter(applySelectionFormatAtom, 'underline')).resolves.toBe(
      'completed',
    )

    expect(writes.map((write) => write.format)).toEqual([
      { bold: true },
      { italic: true },
      { underline: true },
    ])
    expect(writes.every((write) => write.kind === 'set-format-range')).toBe(true)
    expect(writes.every((write) => write.writeMode === 'patch' && write.scope === 'cell')).toBe(true)
    expect(core.store.getter(projectionSnapshotAtom).result?.cells[0]?.format).toEqual(format)
  })

  test('routes row and column selections to their matching Rust style scope', async () => {
    let format: SpreadsheetCellFormat = {}
    let revision = 1
    const writes: SetFormatRangeRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request) {
        return projection(request, format, revision)
      },
      async setRangeFormat(request, projectionRequest) {
        writes.push(request)
        format = { ...format, ...(request.format ?? {}) }
        revision += 1
        return {
          acknowledgement: {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision,
            affectedRange: request.range,
          },
          projection: projection(projectionRequest, format, revision),
        }
      },
    })
    const core = createSpreadsheetUi({ connection })
    core.store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
    core.store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 2 })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window,
      reason: 'viewport',
    })
    await core.store.setter(applySelectionFormatAtom, 'bold')

    core.store.setter(selectColumnsAtom, { sheetId: 'sheet-1', colAnchor: 3 })
    await core.store.setter(applySelectionFormatAtom, 'italic')

    expect(writes.map((write) => write.scope)).toEqual(['row', 'column'])
  })
})
