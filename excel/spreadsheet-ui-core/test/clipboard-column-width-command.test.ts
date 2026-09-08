import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  runVisibleProjectionAtom,
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
  viewportSizeOverridesAtom,
  type RustClipboardPasteRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 7 }
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, projection: VisibleProjectionRequest) => ({
      acknowledgement: {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 1,
        affectedRange: range,
      },
      projection: { ...projection, revision: 1, cells: [] },
      colWidths: [{ colIndex: 5, widthPx: 200 }],
    }),
  )
  const read = vi.fn(async (request: VisibleProjectionRequest) => ({
    ...request,
    revision: 0,
    cells: [],
  }))
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      readVisibleProjection: read,
      pasteClipboard: paste,
    }),
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', name: 'Test', index: 0, rowCount: 10, colCount: 10 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
  })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 1: 55 } },
    colWidthsBySheet: { s: { 5: 400, 6: 300, 9: 500 } },
  })
  const input = {
    operation: 'paste' as const,
    mode: 'column-widths' as const,
    read: async () => ({ text: 'source' }),
  }
  return { store, paste, read, range, input }
}

test('full width results update offscreen columns and clear defaults without touching row heights', async () => {
  const { store, paste, read, input } = await setup()
  expect(await store.setter(runSystemClipboardAtom, input)).toBe(true)
  expect(store.getter(viewportSizeOverridesAtom)).toEqual({
    rowHeightsBySheet: { s: { 1: 55 } },
    colWidthsBySheet: { s: { 5: 200, 9: 500 } },
  })
  expect(paste).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledTimes(1)
})

test('invalid affected columns cannot corrupt the geometry cache', async () => {
  const { store, range, input } = await setup()
  range.colEnd = 100
  const before = store.getter(viewportSizeOverridesAtom)
  expect(await store.setter(runSystemClipboardAtom, input)).toBe(false)
  expect(store.getter(viewportSizeOverridesAtom)).toBe(before)
  expect(store.getter(systemClipboardFeedbackAtom).message).toBe('Invalid column width result.')
})

test('native width rejection preserves the cache and exposes a retryable explanation', async () => {
  const { store, paste, input } = await setup()
  const before = store.getter(viewportSizeOverridesAtom)
  paste.mockRejectedValueOnce(new Error('CLIPBOARD_COLUMN_WIDTH_LOCKED'))
  expect(await store.setter(runSystemClipboardAtom, input)).toBe(false)
  expect(store.getter(viewportSizeOverridesAtom)).toBe(before)
  expect(store.getter(systemClipboardFeedbackAtom).message).toContain('Unprotect the worksheet')
  expect(await store.setter(runSystemClipboardAtom, input)).toBe(true)
})
