import { describe, expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, dragMoveFeedbackAtom, dragMoveSelectionAtom, dragMoveSessionAtom,
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectionSnapshotAtom,
  setSelectionAtom, type RustDragTransferRequest, type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../../src'

type Transfer = (request: RustDragTransferRequest) => void

async function setup(transfer: Transfer = () => {}) {
  let revision = 0
  const projection = (request: VisibleProjectionRequest) => ({ ...request, revision, cells: [] })
  const calls: RustDragTransferRequest[] = []
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'projection.readVisible')
      return projection((payload as { request: VisibleProjectionRequest }).request)
    if (command === 'range.dragTransfer') {
      const input = payload as {
        request: RustDragTransferRequest
        projection: VisibleProjectionRequest
      }
      calls.push(input.request)
      transfer(input.request)
      revision += 1
      const { source, target } = input.request
      return {
        acknowledgement: {
          sheetId: input.request.sheetId, requestId: input.request.requestId, revision,
          affectedRange: {
            rowStart: target.row, colStart: target.col,
            rowEnd: target.row + source.rowEnd - source.rowStart,
            colEnd: target.col + source.colEnd - source.colStart,
          },
        },
        projection: projection(input.projection),
      }
    }
    throw new Error(`Unhandled ${command}`)
  })
  const connection = { request, dispose() {} } as unknown as RustWorkbookConnection
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Drag', sheets: [{ id: 'sheet-1', index: 0, name: 'Drag', rowCount: 20, colCount: 8 }],
  })
  store.setter(setSelectionAtom, {
    kind: 'range', sheetId: 'sheet-1', anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 7 },
  })
  return { store, calls }
}

describe('drag selection border to move or copy', () => {
  test('the grabbed cell follows the pointer and the block stays inside the sheet', async () => {
    const { store } = await setup()
    expect(await store.setter(dragMoveSelectionAtom, {
      type: 'start', coord: { row: 2, col: 1 }, copy: false,
    })).toBe(true)
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 6, col: 4 } })
    expect(store.getter(dragMoveSessionAtom)?.target)
      .toEqual({ rowStart: 5, colStart: 4, rowEnd: 6, colEnd: 5 })
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 19, col: 7 } })
    expect(store.getter(dragMoveSessionAtom)?.target)
      .toEqual({ rowStart: 18, colStart: 6, rowEnd: 19, colEnd: 7 })
  })

  test('release sends one native move and selects the destination', async () => {
    const { store, calls } = await setup()
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 5, col: 3 } })
    const confirmReplace = vi.fn(() => true)
    expect(await store.setter(dragMoveSelectionAtom, {
      type: 'finish', copy: false, confirmReplace,
    })).toBe(true)
    expect(calls).toEqual([expect.objectContaining({
      source: { rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 2 },
      target: { row: 5, col: 3 }, copy: false, replace: false,
    })])
    expect(confirmReplace).not.toHaveBeenCalled()
    expect(store.getter(selectionSnapshotAtom).range)
      .toEqual({ rowStart: 5, colStart: 3, rowEnd: 6, colEnd: 4 })
    expect(store.getter(dragMoveSessionAtom)).toBeNull()
  })

  test('the modifier held at release decides copy', async () => {
    const { store, calls } = await setup()
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    await store.setter(dragMoveSelectionAtom, { type: 'copy', copy: true })
    expect(store.getter(dragMoveSessionAtom)?.copy).toBe(true)
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 8, col: 1 } })
    await store.setter(dragMoveSelectionAtom, { type: 'finish', copy: true, confirmReplace: () => true })
    expect(calls[0]).toMatchObject({ copy: true, target: { row: 8, col: 1 } })
  })

  test('cancel and dropping back on the source send nothing', async () => {
    const { store, calls } = await setup()
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 9, col: 1 } })
    await store.setter(dragMoveSelectionAtom, { type: 'cancel' })
    expect(store.getter(dragMoveSessionAtom)).toBeNull()
    expect(await store.setter(dragMoveSelectionAtom, {
      type: 'finish', copy: false, confirmReplace: () => true,
    })).toBe(false)
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 1, col: 1 } })
    await store.setter(dragMoveSelectionAtom, { type: 'finish', copy: false, confirmReplace: () => true })
    expect(calls).toEqual([])
  })

  test('occupied destinations ask once; declining writes nothing, accepting replaces', async () => {
    const occupied: Transfer = (request) => {
      if (!request.replace) throw new Error('DRAG_TARGET_NOT_EMPTY')
    }
    for (const accepted of [false, true]) {
      const { store, calls } = await setup(occupied)
      await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
      await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 4, col: 1 } })
      const confirmReplace = vi.fn(() => accepted)
      expect(await store.setter(dragMoveSelectionAtom, {
        type: 'finish', copy: false, confirmReplace,
      })).toBe(accepted)
      expect(confirmReplace).toHaveBeenCalledTimes(1)
      expect(calls.map((call) => call.replace)).toEqual(accepted ? [false, true] : [false])
      expect(store.getter(selectionSnapshotAtom).range.rowStart).toBe(accepted ? 4 : 1)
      expect(store.getter(dragMoveFeedbackAtom)).toEqual({ busy: false, error: '' })
    }
  })

  test('native rejections surface the shared clipboard message', async () => {
    const { store } = await setup(() => { throw new Error('CLIPBOARD_LOCKED') })
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    await store.setter(dragMoveSelectionAtom, { type: 'move', coord: { row: 9, col: 5 } })
    expect(await store.setter(dragMoveSelectionAtom, {
      type: 'finish', copy: false, confirmReplace: () => true,
    })).toBe(false)
    expect(store.getter(dragMoveFeedbackAtom).error)
      .toBe('The source or destination includes locked cells.')
    expect(store.getter(selectionSnapshotAtom).range.rowStart).toBe(1)
  })

  test('a selection change abandons the pending drag', async () => {
    const { store, calls } = await setup()
    await store.setter(dragMoveSelectionAtom, { type: 'start', coord: { row: 1, col: 1 }, copy: false })
    store.setter(setSelectionAtom, {
      kind: 'range', sheetId: 'sheet-1', anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 },
    })
    expect(store.getter(dragMoveSessionAtom)).toBeNull()
    await store.setter(dragMoveSelectionAtom, { type: 'finish', copy: false, confirmReplace: () => true })
    expect(calls).toEqual([])
  })
})
