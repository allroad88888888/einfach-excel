import { describe, expect, test, vi } from 'vitest'
import {
  applySelectionFormatAtom,
  clearSelectionAtom,
  createSpreadsheetUi,
  dispatchGridCellKeyboardInputAtom,
  lastRepeatRecordAtom,
  repeatLabelAtom,
  repeatLastActionAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectionMutationFeedbackAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  type RustClearRangeRequest,
  type SetFormatRangeRequest,
  type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup(fail = false) {
  const projection = (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: 1,
    window: request.window,
    cells: [],
  })
  const ack = (
    request: { sheetId: string; requestId: number },
    visible: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
    projection: projection(visible),
  })
  const setRangeFormat = vi.fn(
    async (request: SetFormatRangeRequest, visible: VisibleProjectionRequest) => {
      if (fail) throw new Error('rejected')
      return ack(request, visible)
    },
  )
  const clearRange = vi.fn(
    async (request: RustClearRangeRequest, visible: VisibleProjectionRequest) =>
      ack(request, visible),
  )
  const { store } = createSpreadsheetUi({
    connection: createTestRustWorkbookConnection({
      readVisibleProjection: async (request) => projection(request),
      setRangeFormat,
      clearRange,
    }),
  })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 1 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'sheet-1',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
  })
  return { store, setRangeFormat, clearRange }
}

describe('repeat last action', () => {
  test('has nothing to repeat before any command', async () => {
    const { store, setRangeFormat } = await setup()
    expect(store.getter(repeatLabelAtom)).toBeNull()
    expect(await store.setter(repeatLastActionAtom)).toBe(false)
    expect(setRangeFormat).not.toHaveBeenCalled()
  })

  test('replays a format with the same parameters on the current selection', async () => {
    const { store, setRangeFormat } = await setup()
    expect(await store.setter(applySelectionFormatAtom, { type: 'fill-color', value: '#ffcc00' })).toBe('completed')
    expect(store.getter(repeatLabelAtom)).toBe('fill-color')
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 4, col: 3 } })
    expect(await store.setter(repeatLastActionAtom)).toBe(true)
    expect(setRangeFormat).toHaveBeenCalledTimes(2)
    expect(setRangeFormat.mock.calls[1]?.[0]).toMatchObject({
      format: { bgColor: '#ffcc00' },
      range: { rowStart: 4, rowEnd: 4, colStart: 3, colEnd: 3 },
    })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 4, col: 3 })
  })

  test('names the kind of clear and repeats it', async () => {
    const { store, clearRange } = await setup()
    await store.setter(clearSelectionAtom, 'formats')
    expect(store.getter(lastRepeatRecordAtom)?.label).toBe('clear-formats')
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 2, col: 2 } })
    await store.setter(repeatLastActionAtom)
    expect(clearRange.mock.calls[1]?.[0]).toMatchObject({
      mode: 'formats',
      range: { rowStart: 2, colStart: 2 },
    })
  })

  test('a rejected command is not recorded', async () => {
    const { store } = await setup(true)
    expect(await store.setter(applySelectionFormatAtom, 'bold')).toBe('rejected')
    expect(store.getter(repeatLabelAtom)).toBeNull()
  })

  test('the latest repeatable command replaces the previous one', async () => {
    const { store } = await setup()
    await store.setter(applySelectionFormatAtom, 'bold')
    await store.setter(clearSelectionAtom, 'contents')
    expect(store.getter(repeatLabelAtom)).toBe('clear-contents')
  })

  test('F4 on the grid repeats; Ctrl+Y repeats only when nothing can be redone', async () => {
    const { store, setRangeFormat } = await setup()
    await store.setter(applySelectionFormatAtom, 'italic')
    const press = (key: string, extra: { ctrlKey?: boolean; metaKey?: boolean } = {}) =>
      store.setter(dispatchGridCellKeyboardInputAtom, {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 1 },
        allowEditing: true,
        keyboard: { key, shiftKey: false, ctrlKey: false, metaKey: false, ...extra },
      })
    expect(press('F4').type).toBe('repeat.last')
    const settled = (calls: number) => vi.waitFor(() => {
      expect(setRangeFormat).toHaveBeenCalledTimes(calls)
      expect(store.getter(selectionMutationFeedbackAtom).busy).toBe(false)
    })
    await settled(2)
    press('y', { ctrlKey: true })
    await settled(3)
    press('y', { metaKey: true })
    await settled(4)
    expect(press('F4', { ctrlKey: true }).type).not.toBe('repeat.last')
  })
})
