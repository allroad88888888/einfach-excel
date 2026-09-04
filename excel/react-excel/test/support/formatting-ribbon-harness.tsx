import { createStore } from '@einfach/core'
import {
  runVisibleProjectionAtom,
  selectCellAtom,
  type SetFormatRangeRequest,
  type SpreadsheetCellFormat,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { act, render } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { WorkbookRibbon } from '../../src/workbook/chrome/ribbon/WorkbookRibbon'
import { createTestRustWorkbookConnection } from './rust-workbook-connection'

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
    cells: [{ row: 0, col: 0, displayValue: 'Order', format }],
  }
}

/** Renders the ribbon over a controllable Rust formatting connection. */
export async function renderFormattingRibbon(): Promise<{
  readonly writes: SetFormatRangeRequest[]
}> {
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
  const store = createStore()
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  render(
    <WorkbookStoreProvider connection={connection} store={store}>
      <WorkbookRibbon />
    </WorkbookStoreProvider>,
  )
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
      reason: 'viewport',
    })
  })
  return { writes }
}
