import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  setSelectionAtom,
  runVisibleProjectionAtom,
  runSystemClipboardAtom,
  systemClipboardFeedbackAtom,
  projectionSnapshotAtom,
  protectSheetAtom,
  startCellEditingFromProjectionAtom,
  type RustClipboardCaptureRequest,
  type RustClipboardPasteRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const projection = (request: VisibleProjectionRequest, revision = 0) => ({
    ...request,
    revision,
    cells: [{ row: 0, col: 0, displayValue: revision ? 'pasted' : 'old' }],
  })
  const capture = vi.fn(async (request: RustClipboardCaptureRequest) => ({
    text: 'old',
    rows: 1,
    cols: 1,
    cut: request.cut,
    token: 'snapshot-token',
  }))
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, visible: VisibleProjectionRequest) => ({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: projection(visible, 1),
    }),
  )
  const read = vi.fn(async (request: VisibleProjectionRequest) => projection(request))
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      captureClipboard: capture,
      pasteClipboard: paste,
      readVisibleProjection: read,
    }),
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 'sheet-1', index: 0, name: 'Test', rowCount: 10, colCount: 5 }],
  })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, capture, paste, read }
}

describe('system clipboard commands', () => {
  test.each(['all', 'values', 'formats', 'values-formats'] as const)(
    'sends %s with the full selected range in one RPC',
    async (mode) => {
      const { store, paste, read } = await setup()
      store.setter(setSelectionAtom, {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 3, col: 2 },
      })
      expect(
        await store.setter(runSystemClipboardAtom, {
          operation: 'paste',
          mode,
          read: async () => ({ text: 'value', token: 'snapshot-token' }),
        }),
      ).toBe(true)
      expect(paste).toHaveBeenCalledTimes(1)
      expect(paste.mock.calls[0][0]).toMatchObject({
        mode,
        selection: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 2 },
      })
      expect(read).toHaveBeenCalledTimes(1)
    },
  )

  test.each([{ transpose: true }, { skipBlanks: true }, { transpose: true, skipBlanks: true }])(
    'forwards paste options %j without a second RPC',
    async (options) => {
      const { store, paste, read } = await setup()
      await store.setter(runSystemClipboardAtom, {
        operation: 'paste',
        ...options,
        read: async () => ({ text: '1\t2' }),
      })
      expect(paste).toHaveBeenCalledTimes(1)
      expect(paste.mock.calls[0][0]).toMatchObject(options)
      expect(read).toHaveBeenCalledTimes(1)
    },
  )

  test('skipping blanks lets Rust decide whether a locked anchor will actually be written', async () => {
    const { store, paste } = await setup()
    const unlocked = [{ rowStart: 0, rowEnd: 0, colStart: 1, colEnd: 1 }]
    store.setter(protectSheetAtom, { sheetId: 'sheet-1', unlockedRanges: unlocked })
    await store.setter(runSystemClipboardAtom, {
      operation: 'paste',
      skipBlanks: true,
      read: async () => ({ text: '\t7' }),
    })
    expect(paste.mock.calls[0][0]).toMatchObject({ skipBlanks: true, unlockedRanges: unlocked })
    paste.mockRejectedValueOnce(new Error('CLIPBOARD_LOCKED'))
    const before = store.getter(projectionSnapshotAtom)
    expect(
      await store.setter(runSystemClipboardAtom, {
        operation: 'paste',
        skipBlanks: true,
        read: async () => ({ text: '1\t7' }),
      }),
    ).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(systemClipboardFeedbackAtom).message).toContain('locked')
  })

  test('a size rejection leaves the selection projection intact and reports the mismatch', async () => {
    const { store, paste } = await setup()
    const before = store.getter(projectionSnapshotAtom)
    paste.mockRejectedValueOnce(new Error('CLIPBOARD_SELECTION_SIZE'))
    expect(
      await store.setter(runSystemClipboardAtom, {
        operation: 'paste',
        read: async () => ({ text: '1\t2' }),
      }),
    ).toBe(false)
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(systemClipboardFeedbackAtom).message).toContain('whole copies')
  })
  test.each(['copy', 'cut'] as const)(
    '%s captures Rust data without mutating or reading projection again',
    async (operation) => {
      const { store, capture, paste, read } = await setup()
      const write = vi.fn(async (data) => {
        expect(await data).toMatchObject({ text: 'old' })
      })
      expect(await store.setter(runSystemClipboardAtom, { operation, write })).toBe(true)
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ cut: operation === 'cut' }))
      expect(write).toHaveBeenCalledTimes(1)
      expect(paste).not.toHaveBeenCalled()
      expect(read).toHaveBeenCalledTimes(1)
    },
  )

  test('one paste RPC publishes its returned revision with no refresh RPC', async () => {
    const { store, paste, read } = await setup()
    expect(
      await store.setter(runSystemClipboardAtom, {
        operation: 'paste',
        read: async () => ({ text: 'value', token: 'snapshot-token' }),
      }),
    ).toBe(true)
    expect(paste).toHaveBeenCalledTimes(1)
    expect(paste.mock.calls[0][0]).toMatchObject({
      text: 'value',
      token: 'snapshot-token',
      row: 0,
      col: 0,
      rowCount: 10,
      colCount: 5,
    })
    expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(1)
    expect(read).toHaveBeenCalledTimes(1)
  })

  test('clipboard read failure preserves projection and exposes feedback', async () => {
    const { store, paste } = await setup()
    const before = store.getter(projectionSnapshotAtom)
    await store.setter(runSystemClipboardAtom, {
      operation: 'paste',
      read: async () => {
        throw new Error('Denied')
      },
    })
    expect(paste).not.toHaveBeenCalled()
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(systemClipboardFeedbackAtom)).toMatchObject({
      error: true,
      busy: false,
      message: 'Denied',
    })
  })

  test('selection changes during browser read cancel the pending paste', async () => {
    const { store, paste } = await setup()
    const result = await store.setter(runSystemClipboardAtom, {
      operation: 'paste',
      read: async () => {
        store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
        return { text: 'value' }
      },
    })
    expect(result).toBe(false)
    expect(paste).not.toHaveBeenCalled()
  })

  test('protected paste passes the complete unlocked ranges to Rust', async () => {
    const { store, paste } = await setup()
    const unlocked = [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }]
    store.setter(protectSheetAtom, { sheetId: 'sheet-1', unlockedRanges: unlocked })
    await store.setter(runSystemClipboardAtom, {
      operation: 'paste',
      read: async () => ({ text: 'a\tb\tc' }),
    })
    expect(paste.mock.calls[0][0].unlockedRanges).toEqual(unlocked)
  })

  test('active editing leaves clipboard operations to the input', async () => {
    const { store, capture } = await setup()
    store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 0, col: 0 },
    })
    expect(
      await store.setter(runSystemClipboardAtom, { operation: 'copy', write: async () => {} }),
    ).toBe(false)
    expect(capture).not.toHaveBeenCalled()
  })

  test('Rust rejection does not publish a result or erase the current projection', async () => {
    const { store, paste } = await setup()
    paste.mockRejectedValueOnce(new Error('CLIPBOARD_CUT_SOURCE_CHANGED'))
    const before = store.getter(projectionSnapshotAtom)
    await store.setter(runSystemClipboardAtom, {
      operation: 'paste',
      read: async () => ({ text: 'a' }),
    })
    expect(store.getter(projectionSnapshotAtom)).toBe(before)
    expect(store.getter(systemClipboardFeedbackAtom).message).toContain('cut cells changed')
  })
})
