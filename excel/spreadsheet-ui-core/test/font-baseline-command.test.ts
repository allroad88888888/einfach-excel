import { expect, test } from 'vitest'
import {
  createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom,
  applySelectionFormatAtom, type SpreadsheetCellFormat,
  type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { lastRepeatRecordAtom } from '../src/repeat/state'
import { normalizeFormat } from '../src/contracts/format-normalization'
import { applyVisibleFormats } from '../src/rust-workbook/format-projection'
import { snapshotFormat } from '../src/conditional-formatting/snapshot-format'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  let format: SpreadsheetCellFormat = { fontSize: 24, bold: true }
  let revision = 1
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({
    ...request, revision,
    cells: [{ row: 0, col: 0, displayValue: '12.5', numericValue: 12.5,
      valueKind: 'number' as const, formula: '=25/2', format }],
  })
  const connection = createTestRustWorkbookConnection({
    async readVisibleProjection(request) { return projection(request) },
    async setRangeFormat(request, projected) {
      writes.push(request)
      format = { ...format, ...request.format }
      revision++
      return { acknowledgement: { sheetId: request.sheetId, requestId: request.requestId,
        revision, affectedRange: request.range }, projection: projection(projected) }
    },
  })
  const core = createSpreadsheetUi({ connection })
  core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, { sheetId: 'sheet-1',
    window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }, reason: 'viewport' })
  return { store: core.store, writes }
}

test('one definite sparse patch toggles or replaces baseline while repeat retains its resolved value', async () => {
  const { store, writes } = await setup()
  for (const value of ['superscript', 'subscript', 'subscript'] as const)
    expect(await store.setter(applySelectionFormatAtom, { type: 'font-baseline', value })).toBe('completed')
  expect(writes.map(write => write.format)).toEqual([
    { fontBaseline: 'superscript' }, { fontBaseline: 'subscript' }, { fontBaseline: 'normal' },
  ])
  expect(writes.every(write => write.writeMode === 'patch' && write.targets?.length === 1)).toBe(true)
  expect(store.getter(lastRepeatRecordAtom)).toEqual({ label: 'font-baseline',
    intent: { kind: 'mutation', mutation: { kind: 'format', format: { fontBaseline: 'normal' } } } })
  await expect(store.setter(applySelectionFormatAtom,
    { type: 'font-baseline', value: 'invalid' as never })).resolves.toBe('blocked')
  expect(writes).toHaveLength(3)
})

test('sparse projection keeps explicit normal while missing fields remain absent', () => {
  expect(normalizeFormat({})).toBeUndefined()
  expect(normalizeFormat({ fontBaseline: 'normal' })).toEqual({ fontBaseline: 'normal' })
  const cells = applyVisibleFormats([], { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }, {
    cellStyles: [{ addr: 'A2', format: { fontBaseline: 'normal' } }],
    rowStyles: [{ index: 1, format: { fontBaseline: 'subscript' } }],
    columnStyles: [{ index: 0, format: { fontBaseline: 'superscript' } }],
  })
  expect(cells.map(cell => [cell.row, cell.col, cell.format?.fontBaseline])).toEqual([
    [0, 0, 'superscript'], [1, 0, 'normal'], [1, 1, 'subscript'],
  ])
  expect(snapshotFormat({ fontBaseline: 'normal' })).toEqual({ fontBaseline: 'normal' })
  expect(snapshotFormat({ fontBaseline: 'super' })).toBeNull()
})
