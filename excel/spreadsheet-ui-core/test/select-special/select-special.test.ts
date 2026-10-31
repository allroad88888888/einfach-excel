import { expect, test, vi } from 'vitest'
import {
  clearSelectSpecialFeedbackAtom, createSpreadsheetUi, initializeWorkbookDocumentAtom,
  runSystemClipboardAtom, runVisibleProjectionAtom, selectAllOrRegionAtom, selectCellAtom,
  selectCurrentRegionAtom, selectSpecialFeedbackAtom, selectVisibleCellsAtom,
  selectionRangesAtom, selectionSnapshotAtom, setMultiRegionSelectionAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../../src'

const range = (r0: number, c0: number, r1: number, c1: number) =>
  ({ rowStart: r0, colStart: c0, rowEnd: r1, colEnd: c1 })

async function setup(handlers: Record<string, (input: any) => unknown>) {
  const request = vi.fn(async (command: string, input: unknown) =>
    handlers[command] ? handlers[command](input) : {
      ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  return { store, request }
}

test('visible cells turns the selection into native visible blocks and keeps the active cell', async () => {
  const blocks = [range(0, 0, 1, 1), range(4, 0, 5, 1)]
  const { store, request } = await setup({
    'selection.visibleBlocks': () => ({ blocks, cellCount: 8, revision: 1 }),
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 0 } })
  store.setter(setMultiRegionSelectionAtom, { regions: [
    { kind: 'range', sheetId: 's', anchor: { row: 4, col: 0 }, focus: { row: 0, col: 1 } },
  ] })
  expect(await store.setter(selectVisibleCellsAtom)).toBe(true)
  expect(request).toHaveBeenCalledWith('selection.visibleBlocks',
    { sheetId: 's', ranges: [range(0, 0, 4, 1)], limit: 10_000 })
  expect(store.getter(selectionRangesAtom)).toEqual(blocks)
  expect(store.getter(selectSpecialFeedbackAtom).notice).toContain('8 visible cells in 2 areas')
})

test('visible cells reports no visible cells and rejects inconsistent native results', async () => {
  let reply: unknown = { blocks: [], cellCount: 0, revision: 1 }
  const { store } = await setup({ 'selection.visibleBlocks': () => reply })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  expect(await store.setter(selectVisibleCellsAtom)).toBe(false)
  expect(store.getter(selectSpecialFeedbackAtom).error).toBe('No visible cells in the selection.')
  reply = { blocks: [range(0, 0, 0, 0)], cellCount: 9, revision: 1 }
  expect(await store.setter(selectVisibleCellsAtom)).toBe(false)
  expect(store.getter(selectSpecialFeedbackAtom).error).toContain('inconsistent')
  reply = { blocks: [range(0, 0, 200, 0)], cellCount: 201, revision: 1 }
  expect(await store.setter(selectVisibleCellsAtom)).toBe(false)
  expect(store.getter(selectionRangesAtom)).toEqual([range(1, 1, 1, 1)])
  store.setter(clearSelectSpecialFeedbackAtom)
  expect(store.getter(selectSpecialFeedbackAtom).error).toBeNull()
})

test('current region selects the native region for the active cell', async () => {
  const { store, request } = await setup({
    'selection.currentRegion': () => ({ range: range(1, 1, 4, 3), revision: 1 }),
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 2 } })
  expect(await store.setter(selectCurrentRegionAtom)).toBe(true)
  expect(request).toHaveBeenCalledWith('selection.currentRegion', { sheetId: 's', row: 2, col: 2 })
  expect(store.getter(selectionRangesAtom)).toEqual([range(1, 1, 4, 3)])
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 1, col: 1 })
})

test('Ctrl+A selects the region first and the whole sheet second', async () => {
  const { store } = await setup({
    'selection.currentRegion': () => ({ range: range(1, 1, 4, 3), revision: 1 }),
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 2 } })
  expect(await store.setter(selectAllOrRegionAtom)).toBe('region')
  expect(store.getter(selectionRangesAtom)).toEqual([range(1, 1, 4, 3)])
  expect(await store.setter(selectAllOrRegionAtom)).toBe('all')
  expect(store.getter(selectionRangesAtom)).toEqual([range(0, 0, 99, 7)])
})

test('Ctrl+A on an isolated cell selects the whole sheet at once', async () => {
  const { store } = await setup({
    'selection.currentRegion': () => ({ range: range(5, 5, 5, 5), revision: 1 }),
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 5, col: 5 } })
  expect(await store.setter(selectAllOrRegionAtom)).toBe('all')
  expect(store.getter(selectionRangesAtom)).toEqual([range(0, 0, 99, 7)])
})

test('copy of a multi-block selection sends every block to Rust in one capture', async () => {
  const capture = vi.fn(async () => ({ text: 'x', rows: 3, cols: 2, cut: false, token: 't' }))
  const { store } = await setup({
    'clipboard.capture': capture, 'clipboard.finishCapture': () => undefined,
  })
  const blocks = [range(0, 0, 0, 1), range(2, 0, 3, 1)]
  store.setter(setMultiRegionSelectionAtom, { regions: blocks.map((b) => ({
    kind: 'range' as const, sheetId: 's',
    anchor: { row: b.rowStart, col: b.colStart }, focus: { row: b.rowEnd, col: b.colEnd } })) })
  const write = vi.fn(async () => undefined)
  expect(await store.setter(runSystemClipboardAtom, { operation: 'copy', write })).toBe(true)
  expect(capture).toHaveBeenCalledWith(expect.objectContaining({ blocks, cut: false }))
})
