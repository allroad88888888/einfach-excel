import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, setRustWorkbookConnectionAtom, beginProjectionAtom,
  resolveProjectionAtom, dispatchGridCellKeyboardInputAtom, selectionSnapshotAtom, selectCellAtom,
  setSelectionAtom, addSelectionRegionAtom, keyboardModeAtom, setSheetProtectionAtom,
  nativeTableFeedbackAtom, type NativeTable, type RustWorkbookCommands, type RustWorkbookConnection } from '../src'
import { startCellEditingFromProjectionAtom, resolveContentMutationAtom, runRustHistoryAtom } from '../src'
import { sheetHiddenRowsBackingAtom, viewportHiddenColsBackingAtom,
  viewportFilterHiddenBackingAtom } from '../src/viewport/hidden-state'
import { nativeOutlineProjectionBackingAtom } from '../src/outline/native-state'

type Payload = RustWorkbookCommands['table.change']['payload']
const table: NativeTable = { name: 'Sales', sheet: 'Sheet', sheetIndex: 0,
  range: 'B2:D5', hasHeaders: true, hasTotals: false, columns: ['A', 'B', 'C'] }
function setup(override: Partial<NativeTable> = {}) {
  const store = createStore()
  const current = { ...table, ...override }
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const request = vi.fn(async (_: string, payload: Payload) => ({ changed: true,
    projection: { ...payload.projection, cells: [], revision: 2,
      tables: [{ ...current, range: 'B2:D6' }] } }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, revision: 1, cells: [], tables: [current],
      history: { undoCount: 1, redoCount: 0, notice: null, entries: [{ label: 'Input', sheetIndex: 0,
        range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 } }] } } })
  const select = (row: number, col: number) => store.setter(selectCellAtom, { sheetId: 's', coord: { row, col } })
  const key = (shiftKey = false, extra = {}, allowEditing = true) =>
    store.setter(dispatchGridCellKeyboardInputAtom, { sheetId: 's',
      cell: store.getter(selectionSnapshotAtom).activeCell, allowEditing,
      keyboard: { key: 'Tab', shiftKey, ...extra } })
  const active = () => store.getter(selectionSnapshotAtom).activeCell
  return { store, request, select, key, active }
}

test('Tab wraps forward; Shift+Tab wraps back without mutation or expanding the selection', () => {
  const { store, request, select, key, active } = setup()
  select(2, 3); key()
  expect(active()).toMatchObject({ row: 3, col: 1 })
  key(true); expect(active()).toMatchObject({ row: 2, col: 3 })
  key(true); expect(active()).toMatchObject({ row: 2, col: 2 })
  expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('cell')
  expect(request).not.toHaveBeenCalled()
})
test.each([true, false])('last data cell appends once; totals=%s', async (hasTotals) => {
  const { store, request, select, key, active } = setup({ hasTotals })
  const row = hasTotals ? 3 : 4
  select(row, 3); expect(key().type).toBe('table.append-row')
  expect(active()).toMatchObject({ row, col: 3 })
  key(); expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['table.change', {
    sheetId: 's', revision: 1, action: { kind: 'append-row', name: 'Sales' },
  }])
  await vi.waitFor(() => expect(store.getter(nativeTableFeedbackAtom).busy).toBe(false))
  expect(active()).toMatchObject({ row: row + 1, col: 1 })
})
test('manual, filter and outline hidden axes are skipped in both directions', () => {
  const { store, request, select, key, active } = setup({ range: 'B2:D9' })
  store.setter(sheetHiddenRowsBackingAtom, { s: [3] })
  store.setter(viewportFilterHiddenBackingAtom, { rowsBySheet: { s: [4] } })
  store.setter(nativeOutlineProjectionBackingAtom, { s: { outlineRows: [5], outlineColumns: [3] } })
  store.setter(viewportHiddenColsBackingAtom, { s: [1] })
  select(2, 2); key(); expect(active()).toMatchObject({ row: 6, col: 2 })
  key(true); expect(active()).toMatchObject({ row: 2, col: 2 })
  expect(request).not.toHaveBeenCalled()
})
test.each([
  { from: [1, 3], shift: false, to: [1, 4] }, // 表头
  { from: [4, 3], shift: false, to: [4, 4] }, // 汇总
  { from: [2, 1], shift: true, to: [2, 0] }, // 首格反向退出
])('header/totals/first reverse preserve ordinary movement: %j', ({ from, shift, to }) => {
  const { select, key, active, request } = setup({ hasTotals: true })
  select(from[0], from[1]); key(shift)
  expect(active()).toMatchObject({ row: to[0], col: to[1] })
  expect(request).not.toHaveBeenCalled()
})
test('headerless table starts at its first row', () => {
  const { select, key, active } = setup({ hasHeaders: false })
  select(1, 3); key(); expect(active()).toMatchObject({ row: 2, col: 1 })
  key(true); expect(active()).toMatchObject({ row: 1, col: 3 })
})
test('multi-cell and multi-region selections do not append', () => {
  const { store, select, key, request } = setup()
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 3, col: 2 }, focus: { row: 4, col: 3 } })
  key()
  select(4, 3)
  store.setter(addSelectionRegionAtom, { region: { kind: 'cell', sheetId: 's',
    anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } }, makePrimary: false })
  key(); expect(request).not.toHaveBeenCalled()
})
test('IME, editing mode and retained views cannot append', () => {
  const { store, select, key, request } = setup()
  select(4, 3); key(false, { isComposing: true })
  key(false, {}, false)
  store.setter(keyboardModeAtom, 'editing'); key()
  expect(request).not.toHaveBeenCalled()
})
test('Rust failure is visible and leaves selection in place for retry', async () => {
  const { store, select, key, active, request } = setup()
  request.mockRejectedValueOnce(new Error('No space for another row'))
  select(4, 3); key()
  await vi.waitFor(() => expect(store.getter(nativeTableFeedbackAtom)).toEqual({
    busy: false, error: 'No space for another row',
  }))
  expect(active()).toMatchObject({ row: 4, col: 3 })
  key()
  await vi.waitFor(() => expect(active()).toMatchObject({ row: 5, col: 1 }))
  expect(store.getter(nativeTableFeedbackAtom).error).toBeNull()
})
test('protected workbook rejects append but does not block navigation in existing rows', async () => {
  const { store, select, key, active, request } = setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  select(2, 3); key(); expect(active()).toMatchObject({ row: 3, col: 1 })
  select(4, 3); key()
  expect(request).not.toHaveBeenCalled()
  expect(store.getter(nativeTableFeedbackAtom).error).toContain('Unprotect')
  expect(active()).toMatchObject({ row: 4, col: 3 })
})
test('a late append response does not steal a newer user selection', async () => {
  const { store, select, key, active, request } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  select(4, 3); key(); select(8, 6)
  const input = request.mock.calls[0][1]
  finish({ changed: true, projection: { ...input.projection, cells: [], revision: 2,
    tables: [{ ...table, range: 'B2:D6' }] } })
  await vi.waitFor(() => expect(store.getter(nativeTableFeedbackAtom).busy).toBe(false))
  expect(active()).toMatchObject({ row: 8, col: 6 })
})
test('pending append blocks editing, content mutations and history until the native response', async () => {
  const { store, select, key, request } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  select(4, 3); key()
  expect(store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 4, col: 3 } })).toBe(false)
  expect(store.setter(resolveContentMutationAtom, { kind: 'set-cell-input', sheetId: 's',
    cell: { row: 4, col: 3 } })).toMatchObject({ status: 'blocked', reason: 'table-pending' })
  expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  const input = request.mock.calls[0][1]
  finish({ changed: true, projection: { ...input.projection, cells: [], revision: 2,
    tables: [{ ...table, range: 'B2:D6' }] } })
  await vi.waitFor(() => expect(store.getter(nativeTableFeedbackAtom).busy).toBe(false))
  expect(store.setter(resolveContentMutationAtom, { kind: 'set-cell-input', sheetId: 's',
    cell: { row: 4, col: 3 } }).status).toBe('allowed')
})
