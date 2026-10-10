import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, selectCellAtom, runVisibleProjectionAtom,
  formatPainterAtom, runFormatPainterAtom, setRustWorkbookConnectionAtom,
  setWorkspaceActiveSheetAtom,
  startCellEditingFromProjectionAtom, startPointerSelectionAtom, pointerSessionAtom,
  type RustClipboardCaptureRequest, type RustClipboardPasteRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const capture = vi.fn(async (_request: RustClipboardCaptureRequest) => ({
    text: 'source', rows: 1, cols: 1, cut: false, token: 'painter-token',
  }))
  const paste = vi.fn(async (
    request: RustClipboardPasteRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
    projection: { ...projection, revision: 1, cells: [] },
  }))
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    captureClipboard: capture, pasteClipboard: paste,
    readVisibleProjection: async (request) => ({ ...request, revision: 0,
      cells: [{ row: 0, col: 0, displayValue: 'source' }] }),
  }) })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets: [
    { id: 's', index: 0, name: 'Test', rowCount: 10, colCount: 10 },
    { id: 'other', index: 1, name: 'Other', rowCount: 10, colCount: 10 },
  ] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 } })
  return { store, capture, paste }
}

test('captures Rust formatting once without a UI copy, then paints once and exits', async () => {
  const { store, capture, paste } = await setup()
  expect(store.getter(formatPainterAtom).mode).toBe('idle')
  expect(await store.setter(runFormatPainterAtom, 'arm')).toBe(true)
  expect(capture).toHaveBeenCalledWith({ sheetId: 's', cut: false, painter: true,
    range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } })
  expect(store.getter(formatPainterAtom)).not.toHaveProperty('format')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 3 } })
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(true)
  expect(paste).toHaveBeenCalledTimes(1)
  expect(paste.mock.calls[0]![0]).toMatchObject({ row: 2, col: 3, mode: 'formats',
    text: '', token: 'painter-token', painter: true })
  expect(store.getter(formatPainterAtom).mode).toBe('idle')
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(false)
})

test('continuous mode retains the same native snapshot until explicit exit', async () => {
  const { store, capture, paste } = await setup()
  await store.setter(runFormatPainterAtom, 'sticky')
  for (const row of [1, 2]) {
    store.setter(selectCellAtom, { sheetId: 's', coord: { row, col: 0 } })
    expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(true)
    expect(store.getter(formatPainterAtom).mode).toBe('sticky')
  }
  expect(capture).toHaveBeenCalledTimes(1)
  expect(paste).toHaveBeenCalledTimes(2)
  await store.setter(runFormatPainterAtom, 'exit')
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(false)
})

test('double-click promotes a pending capture without issuing another request', async () => {
  const { store, capture } = await setup()
  let release!: () => void
  capture.mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve({ text: '', rows: 1, cols: 1, cut: false, token: 'one' })
  }))
  const pending = store.setter(runFormatPainterAtom, 'arm')
  await store.setter(runFormatPainterAtom, 'sticky')
  expect(store.getter(formatPainterAtom)).toMatchObject({ mode: 'sticky', busy: true })
  release()
  expect(await pending).toBe(true)
  expect(store.getter(formatPainterAtom)).toMatchObject({ mode: 'sticky', busy: false, token: 'one' })
  expect(capture).toHaveBeenCalledTimes(1)
})

test.each(['selection', 'exit', 'connection', 'sheet'] as const)(
  '%s change during capture cannot resurrect the old session', async (change) => {
    const { store, capture } = await setup()
    let release!: () => void
    capture.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ text: '', rows: 1, cols: 1, cut: false, token: 'old' })
    }))
    const pending = store.setter(runFormatPainterAtom, 'arm')
    if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
    if (change === 'exit') await store.setter(runFormatPainterAtom, 'exit')
    if (change === 'connection') store.setter(setRustWorkbookConnectionAtom, null)
    if (change === 'sheet') {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'other' })
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: 's' })
    }
    release()
    expect(await pending).toBe(false)
    expect(store.getter(formatPainterAtom).mode).toBe('idle')
  },
)

test('pending apply blocks duplicate writes, and exiting cannot be undone by its response', async () => {
  const { store, paste } = await setup()
  let release!: () => void
  paste.mockImplementationOnce((request, projection) => new Promise((resolve) => {
    release = () => resolve({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: { ...projection, revision: 1, cells: [] },
    })
  }))
  await store.setter(runFormatPainterAtom, 'sticky')
  const pending = store.setter(runFormatPainterAtom, 'apply')
  await vi.waitFor(() => expect(paste).toHaveBeenCalledTimes(1))
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(false)
  await store.setter(runFormatPainterAtom, 'exit')
  release()
  await pending
  expect(store.getter(formatPainterAtom).mode).toBe('idle')
})

test('native rejection retains the brush for a corrected target and exposes feedback', async () => {
  const { store, paste } = await setup()
  await store.setter(runFormatPainterAtom, 'arm')
  paste.mockRejectedValueOnce(new Error('CLIPBOARD_SELECTION_SIZE'))
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(false)
  expect(store.getter(formatPainterAtom)).toMatchObject({ mode: 'armed', busy: false, error: true })
  expect(store.getter(formatPainterAtom).message).toContain('whole copies')
  expect(await store.setter(runFormatPainterAtom, 'apply')).toBe(true)
})

test('capture errors stay idle and do not dispatch a mutation', async () => {
  const { store, capture, paste } = await setup()
  capture.mockRejectedValueOnce(new Error('CLIPBOARD_PARTIAL_MERGE'))
  expect(await store.setter(runFormatPainterAtom, 'arm')).toBe(false)
  expect(store.getter(formatPainterAtom)).toMatchObject({ mode: 'idle', error: true })
  expect(paste).not.toHaveBeenCalled()
})

test('editing blocks arming, while an ordinary pointer release still ends selection', async () => {
  const { store, capture, paste } = await setup()
  store.setter(startPointerSelectionAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runFormatPainterAtom, 'end-selection')
  expect(store.getter(pointerSessionAtom).status).not.toBe('active')
  expect(paste).not.toHaveBeenCalled()
  store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } })
  expect(await store.setter(runFormatPainterAtom, 'arm')).toBe(false)
  expect(capture).not.toHaveBeenCalled()
})

test('separate workbooks do not share brush state or tokens', async () => {
  const first = await setup()
  const second = await setup()
  await first.store.setter(runFormatPainterAtom, 'sticky')
  expect(second.store.getter(formatPainterAtom).mode).toBe('idle')
  expect(second.capture).not.toHaveBeenCalled()
})
