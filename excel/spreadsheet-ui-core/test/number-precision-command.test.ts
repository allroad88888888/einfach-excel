import { describe, expect, test } from 'vitest'
import {
  activeCellFormatAtom,
  applySelectionFormatAtom,
  createSpreadsheetUi,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectColumnsAtom,
  selectRowsAtom,
  setSelectionBoundsAtom,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(format: SpreadsheetCellFormat = {}, numericValue = 15.8) {
  let revision = 1
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision,
    window: request.window,
    cells: [{ row: 0, col: 0, displayValue: String(numericValue), numericValue, format }],
  })
  const connection = createTestRustWorkbookConnection({
    async readVisibleProjection(request) {
      return projection(request)
    },
    async setRangeFormat(request, projectionRequest) {
      writes.push(request)
      format = { ...format, ...request.format }
      revision += 1
      return {
        acknowledgement: {
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision,
          affectedRange: request.range,
        },
        projection: projection(projectionRequest),
      }
    },
  })
  const { store } = createSpreadsheetUi({ connection })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
    reason: 'viewport',
  })
  return { store, writes }
}

describe('selection number precision', () => {
  test('starts from general precision and restores general without changing the value or font', async () => {
    const { store, writes } = await setup({ bold: true, fgColor: '#c00000' })
    for (const action of ['increase-decimal', 'decrease-decimal', 'general-format'] as const) {
      await expect(store.setter(applySelectionFormatAtom, action)).resolves.toBe('completed')
    }
    expect(writes.map((write) => write.format)).toEqual([
      { numberFormat: { kind: 'number', digits: 2 } },
      { numberFormat: { kind: 'number', digits: 1 } },
      { numberFormat: { kind: 'general' } },
    ])
    expect(writes.every((write) => write.writeMode === 'patch')).toBe(true)
    expect(store.getter(activeCellFormatAtom)).toEqual({
      bold: true,
      fgColor: '#c00000',
      numberFormat: { kind: 'general' },
    })
    expect(store.getter(projectionSnapshotAtom).result?.cells[0]?.numericValue).toBe(15.8)
  })

  test.each([
    { kind: 'percent', digits: 0 },
    { kind: 'percentage', digits: 0, negative: 'red' },
    { kind: 'currency', digits: 2, symbol: '€', negative: 'parens' },
    { kind: 'number', digits: 2, thousands: true },
  ] as const)('preserves $kind options when adjusting precision', async (numberFormat) => {
    const { store, writes } = await setup({ numberFormat })
    await store.setter(applySelectionFormatAtom, 'increase-decimal')
    await store.setter(applySelectionFormatAtom, 'decrease-decimal')
    expect(writes.map((write) => write.format?.numberFormat)).toEqual([
      { ...numberFormat, digits: numberFormat.digits + 1 },
      numberFormat,
    ])
  })

  test.each([0, 15])('keeps precision within bounds at %i', async (digits) => {
    const { store, writes } = await setup({ numberFormat: { kind: 'number', digits } })
    await store.setter(
      applySelectionFormatAtom,
      digits === 0 ? 'decrease-decimal' : 'increase-decimal',
    )
    expect(writes[0]?.format?.numberFormat).toEqual({ kind: 'number', digits })
  })

  test('counts decimals in small general numbers', async () => {
    const { store, writes } = await setup({}, 1.2e-7)
    await store.setter(applySelectionFormatAtom, 'increase-decimal')
    expect(writes[0]?.format?.numberFormat).toEqual({ kind: 'number', digits: 9 })
  })

  test('does not overwrite date formatting with decimal formatting', async () => {
    const { store, writes } = await setup({ numberFormat: { kind: 'date' } })
    await expect(store.setter(applySelectionFormatAtom, 'increase-decimal')).resolves.toBe(
      'blocked',
    )
    expect(writes).toHaveLength(0)
  })

  test.each(['row', 'column'] as const)(
    'writes %s precision to its Rust style scope',
    async (scope) => {
      const { store, writes } = await setup({ numberFormat: { kind: 'currency', digits: 2 } })
      if (scope === 'row') {
        store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 0 })
      } else {
        store.setter(selectColumnsAtom, { sheetId: 'sheet-1', colAnchor: 0 })
      }
      await store.setter(applySelectionFormatAtom, 'decrease-decimal')
      expect(writes[0]).toMatchObject({
        scope,
        format: { numberFormat: { kind: 'currency', digits: 1 } },
        range: {
          rowStart: 0,
          rowEnd: scope === 'row' ? 0 : 9,
          colStart: 0,
          colEnd: scope === 'row' ? 4 : 0,
        },
      })
    },
  )
})
