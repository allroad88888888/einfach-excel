import {
  createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom,
  type SpreadsheetCellFormat, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { createTestRustWorkbookConnection } from '../../../excel/spreadsheet-ui-core/test/support/rust-workbook-connection'

interface PatternFixture {
  store: ReturnType<typeof createSpreadsheetUi>['store']
  connection: ReturnType<typeof createTestRustWorkbookConnection>
  writes: SetFormatRangeRequest[]
  fail: (value: boolean) => void
  hold: () => void
  release: () => void
}

export async function setup(): Promise<PatternFixture> {
  let format: SpreadsheetCellFormat = { fgColor: '#123abc', bold: true }
  let revision = 1
  let fail = false
  let release: (() => void) | undefined
  const writes: SetFormatRangeRequest[] = []
  const projection = (request: VisibleProjectionRequest) => ({ ...request, revision,
    cells: [{ row: 0, col: 0, displayValue: 'Kept', format }],
  })
  const connection = createTestRustWorkbookConnection({
    async readVisibleProjection(request) { return projection(request) },
    async setRangeFormat(request, projected) {
      writes.push(request)
      if (fail) throw new Error('native rejected')
      if (release) await new Promise<void>(resolve => { release = resolve })
      format = { ...format, ...request.format }
      for (const key of request.clearFormatFields ?? []) delete format[key]
      revision++
      return { acknowledgement: { sheetId: request.sheetId, requestId: request.requestId,
        revision, affectedRange: request.range }, projection: projection(projected) }
    },
  })
  const core = createSpreadsheetUi({ connection })
  core.store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, { sheetId: 'sheet-1',
    window: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 3 }, reason: 'viewport' })
  return { store: core.store, connection, writes, fail: (value: boolean) => { fail = value },
    hold: () => { release = () => {} }, release: () => { release?.(); release = undefined } }
}
