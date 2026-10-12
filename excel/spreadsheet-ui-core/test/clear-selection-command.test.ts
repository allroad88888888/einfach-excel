import { describe, expect, test, vi } from 'vitest'
import {
  clearSelectionAtom,
  createSpreadsheetUi,
  dispatchGridCellKeyboardInputAtom,
  projectionSnapshotAtom,
  runVisibleProjectionAtom,
  selectRowsAtom,
  selectCellAtom,
  setMultiRegionSelectionAtom,
  selectionMutationFeedbackAtom,
  setRustWorkbookConnectionAtom,
  setSheetProtectionAtom,
  setSelectionBoundsAtom,
  startCellEditingFromProjectionAtom,
  type RustClearRangeRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(failure: 'none' | 'reject' | 'bad-ack' = 'none') {
  const projection = (request: VisibleProjectionRequest, value = '123') => ({
    kind: 'visible-window' as const,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: 1,
    window: request.window,
    cells: [{ row: 1, col: 1, displayValue: value }],
  })
  const clearRange = vi.fn(
    async (request: RustClearRangeRequest, visible: VisibleProjectionRequest) => {
      if (failure === 'reject') throw new Error('Rejected clear')
      return {
        acknowledgement: {
          sheetId: request.sheetId,
          requestId: request.requestId + (failure === 'bad-ack' ? 1 : 0),
          revision: 1,
        },
        projection: projection(visible, request.mode === 'formats' ? '123' : ''),
      }
    },
  )
  const read = vi.fn(async (request: VisibleProjectionRequest) => projection(request))
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({ readVisibleProjection: read, clearRange }),
  })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, clearRange, read }
}

describe('clear selection command', () => {
  test.each(['contents', 'formats', 'all'] as const)('clears every selected area with one %s request', async (mode) => {
    const { store, clearRange, read } = await setup()
    store.setter(setMultiRegionSelectionAtom, { regions: [
      { kind: 'cell', sheetId: 'sheet-1', anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } },
      { kind: 'range', sheetId: 'sheet-1', anchor: { row: 4, col: 3 }, focus: { row: 5, col: 3 } },
    ] })
    expect(await store.setter(clearSelectionAtom, mode)).toBe('completed')
    expect(clearRange).toHaveBeenCalledTimes(1)
    expect(clearRange.mock.calls[0]?.[0]).toMatchObject({ mode, targets: [
      { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1, scope: 'cell' },
      { rowStart: 4, rowEnd: 5, colStart: 3, colEnd: 3, scope: 'cell' },
    ] })
    expect(read).toHaveBeenCalledTimes(1)
  })

  test.each(['contents', 'formats', 'all'] as const)(
    'sends %s in one RPC and uses its returned projection',
    async (mode) => {
      const { store, clearRange, read } = await setup()
      await expect(store.setter(clearSelectionAtom, mode)).resolves.toBe('completed')
      expect(clearRange).toHaveBeenCalledTimes(1)
      expect(clearRange.mock.calls[0]?.[0]).toMatchObject({
        mode,
        scope: 'cell',
        range: { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
      })
      expect(read).toHaveBeenCalledTimes(1)
      expect(store.getter(projectionSnapshotAtom).result?.cells[0]?.displayValue).toBe(
        mode === 'formats' ? '123' : '',
      )
    },
  )

  test('uses row scope without splitting the request into per-cell writes', async () => {
    const { store, clearRange } = await setup()
    store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 1 })
    await store.setter(clearSelectionAtom, 'formats')
    expect(clearRange.mock.calls[0]?.[0]).toMatchObject({
      scope: 'row',
      range: { rowStart: 1, rowEnd: 1, colStart: 0, colEnd: 4 },
    })
  })

  test.each(['reject', 'bad-ack'] as const)('preserves the projection on %s', async (failure) => {
    const { store } = await setup(failure)
    const before = store.getter(projectionSnapshotAtom).result
    await expect(store.setter(clearSelectionAtom, 'all')).resolves.toBe('rejected')
    expect(store.getter(projectionSnapshotAtom).result).toBe(before)
    expect(store.getter(selectionMutationFeedbackAtom)).toMatchObject({ busy: false,
      error: expect.any(String) })
  })

  test('a locked later region prevents the entire request, including the unlocked first area', async () => {
    const { store, clearRange } = await setup()
    store.setter(setMultiRegionSelectionAtom, { regions: [
      { kind: 'cell', sheetId: 'sheet-1', anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } },
      { kind: 'cell', sheetId: 'sheet-1', anchor: { row: 3, col: 1 }, focus: { row: 3, col: 1 } },
    ] })
    store.setter(setSheetProtectionAtom, { sheetId: 'sheet-1', state: { mode: 'protected',
      unlockedRanges: [{ rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }] } })
    expect(await store.setter(clearSelectionAtom, 'all')).toBe('blocked')
    expect(clearRange).not.toHaveBeenCalled()
    expect(store.getter(selectionMutationFeedbackAtom).error).toContain('locked')
  })

  test('row and column regions keep their own scope in one request', async () => {
    const { store, clearRange } = await setup()
    store.setter(setMultiRegionSelectionAtom, { regions: [
      { kind: 'row', sheetId: 'sheet-1', rowAnchor: 2, rowFocus: 2 },
      { kind: 'column', sheetId: 'sheet-1', colAnchor: 3, colFocus: 3 },
    ] })
    expect(await store.setter(clearSelectionAtom, 'formats')).toBe('completed')
    expect(clearRange.mock.calls[0]?.[0].targets).toEqual([
      { rowStart: 2, rowEnd: 2, colStart: 0, colEnd: 4, scope: 'row' },
      { rowStart: 0, rowEnd: 9, colStart: 3, colEnd: 3, scope: 'column' },
    ])
  })

  test('mixed worksheets are rejected instead of changing only the active sheet', async () => {
    const { store, clearRange } = await setup()
    store.setter(setMultiRegionSelectionAtom, { regions: ['sheet-1', 'other'].map((sheetId) => ({
      kind: 'cell' as const, sheetId, anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 },
    })) })
    expect(await store.setter(clearSelectionAtom, 'contents')).toBe('blocked')
    expect(clearRange).not.toHaveBeenCalled()
    expect(store.getter(selectionMutationFeedbackAtom).error).toContain('one worksheet')
  })

  test.each([false, true])('pending clear blocks duplicates and isolates connection change=%s', async (disconnect) => {
    const { store, clearRange } = await setup()
    let reject!: (error: Error) => void
    clearRange.mockImplementationOnce(() => new Promise<never>((_, fail) => { reject = fail }))
    const pending = store.setter(clearSelectionAtom, 'all')
    expect(store.getter(selectionMutationFeedbackAtom).busy).toBe(true)
    expect(await store.setter(clearSelectionAtom, 'contents')).toBe('blocked')
    expect(clearRange).toHaveBeenCalledTimes(1)
    if (disconnect) store.setter(setRustWorkbookConnectionAtom, null)
    reject(new Error('Native capacity limit'))
    expect(await pending).toBe(disconnect ? 'superseded' : 'rejected')
    expect(store.getter(selectionMutationFeedbackAtom)).toMatchObject({ busy: false,
      error: disconnect ? null : 'Native capacity limit' })
    if (!disconnect) {
      expect(await store.setter(clearSelectionAtom, 'contents')).toBe('completed')
      expect(store.getter(selectionMutationFeedbackAtom).error).toBeNull()
    }
  })

  test('does not erase an active editing draft', async () => {
    const { store, clearRange } = await setup()
    store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 1 },
    })
    await expect(store.setter(clearSelectionAtom, 'all')).resolves.toBe('blocked')
    expect(clearRange).not.toHaveBeenCalled()
  })

  test('Delete uses the same clear command', async () => {
    const { store, clearRange } = await setup()
    store.setter(dispatchGridCellKeyboardInputAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 1 },
      allowEditing: true,
      keyboard: { key: 'Delete' },
    })
    await vi.waitFor(() => expect(clearRange).toHaveBeenCalledTimes(1))
    expect(clearRange.mock.calls[0]?.[0].mode).toBe('contents')
  })
})
