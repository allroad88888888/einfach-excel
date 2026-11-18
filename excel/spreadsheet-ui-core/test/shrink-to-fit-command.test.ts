import { expect, test } from 'vitest'
import {
  createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom, applySelectionFormatAtom,
  type SpreadsheetCellFormat, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { lastRepeatRecordAtom } from '../src/repeat/state'
import { normalizeFormat } from '../src/contracts/format-normalization'
import { applyVisibleFormats } from '../src/rust-workbook/format-projection'
import { snapshotFormat } from '../src/conditional-formatting/snapshot-format'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

test('each layout switch sends one definite patch and repeat retains both resolved flags', async () => {
  let format: SpreadsheetCellFormat = { wrap: true, fontSize: 24 }
  let revision = 1
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({ ...request, revision,
    cells: [{ row: 0, col: 0, displayValue: 'Order', format }] })
  const core = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    async readVisibleProjection(request) { return projection(request) },
    async setRangeFormat(request, projected) {
      writes.push(request); format = { ...format, ...request.format }; revision++
      return { acknowledgement: { sheetId: request.sheetId, requestId: request.requestId,
        revision, affectedRange: request.range }, projection: projection(projected) }
    },
  }) })
  const store = core.store
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 'sheet-1',
    window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }, reason: 'viewport' })
  await store.setter(applySelectionFormatAtom, { type: 'shrink-to-fit', value: true })
  expect(store.getter(lastRepeatRecordAtom)?.intent).toEqual({ kind: 'mutation', mutation: {
    kind: 'format', format: { shrinkToFit: true, wrap: false },
  } })
  await store.setter(applySelectionFormatAtom, 'wrap-text')
  expect(store.getter(lastRepeatRecordAtom)?.intent).toEqual({ kind: 'mutation', mutation: {
    kind: 'format', format: { wrap: true, shrinkToFit: false },
  } })
  await store.setter(applySelectionFormatAtom, { type: 'shrink-to-fit', value: false })
  await store.setter(applySelectionFormatAtom, 'wrap-text')
  expect(writes.map(write => write.format)).toEqual([
    { shrinkToFit: true, wrap: false }, { wrap: true, shrinkToFit: false },
    { shrinkToFit: false }, { wrap: false },
  ])
  expect(writes.every(write => write.writeMode === 'patch' && write.targets?.length === 1)).toBe(true)
  expect(format.fontSize).toBe(24)
  await expect(store.setter(applySelectionFormatAtom,
    { type: 'shrink-to-fit', value: 'true' as never })).resolves.toBe('blocked')
  expect(writes).toHaveLength(4)
})

test('projection preserves explicit false and keeps wrap precedence as stored data', () => {
  expect(normalizeFormat({})).toBeUndefined()
  expect(normalizeFormat({ shrinkToFit: false })).toEqual({ shrinkToFit: false })
  const cells = applyVisibleFormats([], { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }, {
    cellStyles: [{ addr: 'A2', format: { shrinkToFit: false } }],
    rowStyles: [{ index: 1, format: { shrinkToFit: true, wrap: true } }],
    columnStyles: [{ index: 0, format: { shrinkToFit: true } }],
  })
  const flags = cells.map(cell => [cell.row, cell.col, cell.format?.shrinkToFit, cell.format?.wrap])
  expect(flags).toEqual([
    [0, 0, true, undefined], [1, 0, false, true], [1, 1, true, true],
  ])
  expect(snapshotFormat({ shrinkToFit: false })).toEqual({ shrinkToFit: false })
  expect(snapshotFormat({ shrinkToFit: 'true' })).toBeNull()
})
