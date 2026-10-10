import { describe, expect, test } from 'vitest'
import {
  applySelectionFormatAtom,
  createSpreadsheetUi,
  runVisibleProjectionAtom,
  selectCellAtom,
  SELECTION_ALL_BORDERS,
  SELECTION_BORDER_COLOR,
  SELECTION_FILL_COLOR,
  SELECTION_TEXT_COLOR,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

describe('selection cell appearance command', () => {
  test('applies colors, alignment, rotation and borders through Rust', async () => {
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
        for (const field of request.clearFormatFields ?? []) delete format[field]
        // 只模拟活动格回显；共边与历史由原生测试验证。
        if (request.borderPatch) {
          format.borders = request.borderPatch.preset === 'all' ? SELECTION_ALL_BORDERS : {}
        }
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

    await core.store.setter(applySelectionFormatAtom, 'fill-color')
    await core.store.setter(applySelectionFormatAtom, 'text-color')
    for (const value of ['center', 'right', 'left'] as const)
      await core.store.setter(applySelectionFormatAtom, { type: 'horizontal-alignment', value })
    for (const value of ['top', 'center', 'bottom'] as const)
      await core.store.setter(applySelectionFormatAtom, { type: 'vertical-alignment', value })
    for (const value of [45, -45, 0])
      await core.store.setter(applySelectionFormatAtom, { type: 'text-rotation', value })
    await core.store.setter(applySelectionFormatAtom, 'all-borders')
    await core.store.setter(applySelectionFormatAtom, 'all-borders')

    expect(writes.map((write) => write.format)).toEqual([
      { bgColor: SELECTION_FILL_COLOR },
      { fgColor: SELECTION_TEXT_COLOR },
      { align: 'center' },
      { align: 'right' },
      { align: 'left' },
      { verticalAlign: 'top' },
      { verticalAlign: 'center' },
      { verticalAlign: 'bottom' },
      { rotation: 45 },
      { rotation: -45 },
      { rotation: 0 },
      {},
      {},
    ])
    expect(writes[11]?.borderPatch).toEqual({
      preset: 'all', style: 'thin', color: SELECTION_BORDER_COLOR,
    })
    expect(writes[12]?.borderPatch).toEqual({
      preset: 'none', style: 'thin', color: SELECTION_BORDER_COLOR,
    })
    expect(writes[12]?.clearFormatFields).toBeUndefined()
  })
})

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
