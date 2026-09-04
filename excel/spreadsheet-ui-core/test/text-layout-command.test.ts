import { describe, expect, test } from 'vitest'
import {
  applySelectionFormatAtom,
  createSpreadsheetUi,
  runVisibleProjectionAtom,
  selectCellAtom,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

function projectedCell(
  request: VisibleProjectionRequest,
  format: SpreadsheetCellFormat,
  revision: number,
) {
  return {
    kind: 'visible-window' as const,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: request.window,
    cells: [{ row: 0, col: 0, displayValue: 'Order', format }],
  }
}

describe('selection text layout command', () => {
  test('sets font, wrap and indent through sparse Rust patches', async () => {
    let format: SpreadsheetCellFormat = {}
    let revision = 1
    const writes: SetFormatRangeRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request) {
        return projectedCell(request, format, revision)
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
          projection: projectedCell(projectionRequest, format, revision),
        }
      },
    })
    const core = createSpreadsheetUi({ connection })
    core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
      reason: 'viewport',
    })

    await core.store.setter(applySelectionFormatAtom, {
      type: 'font-family',
      value: 'Georgia',
    })
    await core.store.setter(applySelectionFormatAtom, { type: 'font-size', value: 16 })
    await core.store.setter(applySelectionFormatAtom, 'wrap-text')
    await core.store.setter(applySelectionFormatAtom, 'increase-indent')
    await core.store.setter(applySelectionFormatAtom, 'increase-indent')
    await core.store.setter(applySelectionFormatAtom, 'decrease-indent')

    expect(writes.map((write) => write.format)).toEqual([
      { fontFamily: 'Georgia' },
      { fontSize: 16 },
      { wrap: true },
      { indent: 1 },
      { indent: 2 },
      { indent: 1 },
    ])
    expect(writes.every((write) => write.writeMode === 'patch')).toBe(true)
  })

  test('blocks invalid font values before sending a Rust command', async () => {
    const writes: SetFormatRangeRequest[] = []
    const connection = createTestRustWorkbookConnection({
      async readVisibleProjection(request) {
        return projectedCell(request, {}, 1)
      },
      async setRangeFormat(request, projectionRequest) {
        writes.push(request)
        return {
          acknowledgement: {
            sheetId: request.sheetId,
            requestId: request.requestId,
            revision: 2,
            affectedRange: request.range,
          },
          projection: projectedCell(projectionRequest, {}, 2),
        }
      },
    })
    const core = createSpreadsheetUi({ connection })
    core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
      reason: 'viewport',
    })

    await expect(
      core.store.setter(applySelectionFormatAtom, { type: 'font-family', value: ' ' }),
    ).resolves.toBe('blocked')
    await expect(
      core.store.setter(applySelectionFormatAtom, { type: 'font-size', value: 0 }),
    ).resolves.toBe('blocked')
    expect(writes).toEqual([])
  })
})
