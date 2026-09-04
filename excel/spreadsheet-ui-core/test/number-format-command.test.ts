import { describe, expect, test } from 'vitest'
import {
  applySelectionFormatAtom,
  createSpreadsheetUi,
  runVisibleProjectionAtom,
  selectCellAtom,
  SELECTION_CURRENCY_FORMAT,
  SELECTION_PERCENT_FORMAT,
  SELECTION_THOUSANDS_FORMAT,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

function projection(
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
    cells: [{ row: 0, col: 0, displayValue: '1234.5', numericValue: 1234.5, format }],
  }
}

describe('selection number format command', () => {
  test('toggles percent, currency and thousands formats through Rust', async () => {
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
    core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      reason: 'viewport',
    })

    await core.store.setter(applySelectionFormatAtom, 'percent-format')
    await core.store.setter(applySelectionFormatAtom, 'percent-format')
    await core.store.setter(applySelectionFormatAtom, 'currency-format')
    await core.store.setter(applySelectionFormatAtom, 'thousands-format')

    expect(writes.map((write) => write.format)).toEqual([
      { numberFormat: SELECTION_PERCENT_FORMAT },
      { numberFormat: { kind: 'general' } },
      { numberFormat: SELECTION_CURRENCY_FORMAT },
      { numberFormat: SELECTION_THOUSANDS_FORMAT },
    ])
    expect(writes.every((write) => write.writeMode === 'patch')).toBe(true)
  })
})
