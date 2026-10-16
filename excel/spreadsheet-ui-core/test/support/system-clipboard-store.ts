import { vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, selectCellAtom, runVisibleProjectionAtom,
  type RustClipboardCaptureRequest, type RustClipboardPasteRequest, type VisibleProjectionRequest,
} from '../../src'
import { createTestRustWorkbookConnection } from './rust-workbook-connection'

/** 两组 command 用例共用可控的 Rust 边界；被测 atom、投影与选区均用实际实现。 */
export async function setupClipboardStore() {
  const projection = (request: VisibleProjectionRequest, revision = 0) => ({
    ...request, revision,
    cells: [{ row: 0, col: 0, displayValue: revision ? 'pasted' : 'old' }],
  })
  const capture = vi.fn(async (request: RustClipboardCaptureRequest) => ({
    text: 'old', rows: 1, cols: 1, cut: request.cut, token: 'snapshot-token',
  }))
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, visible: VisibleProjectionRequest) => ({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: projection(visible, 1),
    }),
  )
  const read = vi.fn(async (request: VisibleProjectionRequest) => projection(request))
  const finish = vi.fn(async () => {})
  const connection = createTestRustWorkbookConnection({
    captureClipboard: capture, finishClipboardCapture: finish,
    pasteClipboard: paste, readVisibleProjection: read,
  })
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 'sheet-1', index: 0, name: 'Test', rowCount: 10, colCount: 5 }],
  })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, capture, paste, read, finish, connection }
}
