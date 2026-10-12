import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  goToSpecialAvailableAtom, goToSpecialPanelAtom, runGoToSpecialAtom,
  selectionRangesAtom, selectionSnapshotAtom, selectCellAtom, setMultiRegionSelectionAtom,
  applyGoToTargetAtom, startEditingAtom, setRustWorkbookConnectionAtom,
  applySelectionFormatAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '../src'
import type { LocatedCells } from '../src/rust-workbook/find-commands'

const scope = { rowStart: 0, colStart: 0, rowEnd: 99, colEnd: 7 }
const ranges = [{ rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 1 },
  { rowStart: 7, rowEnd: 7, colStart: 3, colEnd: 3 }]
const found = { scope, ranges, cellCount: 4, revision: 1 }
async function setup() {
  const locate = vi.fn(async (): Promise<LocatedCells & { revision: number }> => found)
  const request = vi.fn(async (command: string, input: unknown) => command === 'workbook.locate'
    ? locate()
    : { ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 1 } })
  await store.setter(runGoToSpecialAtom, 'open')
  return { store, locate, request }
}

test.each(['constants', 'formulas', 'blanks'] as const)('%s uses one native query and selects every returned region', async (kind) => {
  const { store, request } = await setup()
  expect(store.getter(goToSpecialPanelAtom).scope).toBe('Entire worksheet canvas: A1:H100')
  expect(await store.setter(runGoToSpecialAtom, kind)).toBe(true)
  expect(request).toHaveBeenLastCalledWith('workbook.locate', { sheetId: 's', range: scope, kind, limit: 500 })
  expect(store.getter(selectionRangesAtom)).toEqual(ranges)
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 2, col: 1 })
  expect(store.getter(goToSpecialPanelAtom)).toMatchObject({ open: false, busy: false,
    notice: 'Selected 4 cells in 2 areas. Searched A1:H100.' })
  expect(request).toHaveBeenCalledTimes(2)
})

test('a selected range restricts the native scope, without scanning the viewport', async () => {
  const { store, request, locate } = await setup()
  const range = { rowStart: 50, rowEnd: 80, colStart: 2, colEnd: 3 }
  store.setter(applyGoToTargetAtom, { sheetId: 's', range })
  locate.mockResolvedValueOnce({ scope: range, ranges: [range], cellCount: 62, revision: 1 })
  expect(await store.setter(runGoToSpecialAtom, 'blanks')).toBe(true)
  expect(request).toHaveBeenLastCalledWith('workbook.locate', { sheetId: 's', range, kind: 'blanks', limit: 500 })
})

test('no matches and native capacity errors preserve the original selection and allow retry', async () => {
  const { store, locate } = await setup()
  const before = store.getter(selectionSnapshotAtom)
  locate.mockResolvedValueOnce({ ...found, ranges: [], cellCount: 0 })
  expect(await store.setter(runGoToSpecialAtom, 'constants')).toBe(false)
  expect(store.getter(goToSpecialPanelAtom).error).toContain('No matching cells')
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  locate.mockRejectedValueOnce(new Error('Select a smaller range'))
  expect(await store.setter(runGoToSpecialAtom, 'blanks')).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  expect(await store.setter(runGoToSpecialAtom, 'formulas')).toBe(true)
})

test.each(['move', 'close', 'disconnect', 'edit'] as const)('late reply after %s cannot steal selection', async (action) => {
  const { store, locate } = await setup()
  let resolve!: (value: typeof found) => void
  locate.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const pending = store.setter(runGoToSpecialAtom, 'constants')
  expect(store.getter(goToSpecialAvailableAtom)).toBe(false)
  expect(await store.setter(runGoToSpecialAtom, 'formulas')).toBe(false)
  if (action === 'move') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 70, col: 0 } })
  if (action === 'close') await store.setter(runGoToSpecialAtom, 'close')
  if (action === 'disconnect') store.setter(setRustWorkbookConnectionAtom, null)
  if (action === 'edit') store.setter(startEditingAtom, { sheetId: 's', cell: { row: 3, col: 1 }, draft: 'keep', source: 'cell' })
  const before = store.getter(selectionSnapshotAtom)
  resolve(found)
  expect(await pending).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  expect(store.getter(goToSpecialPanelAtom).busy).toBe(false)
})

test('close/reopen isolates an old query from a new modal', async () => {
  const { store, locate } = await setup()
  let resolve!: (value: typeof found) => void
  locate.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const pending = store.setter(runGoToSpecialAtom, 'formulas')
  await store.setter(runGoToSpecialAtom, 'close')
  await store.setter(runGoToSpecialAtom, 'open')
  resolve(found)
  expect(await pending).toBe(false)
  expect(store.getter(goToSpecialPanelAtom)).toMatchObject({ open: true, busy: false, error: null })
})

test.each([
  { ...found, revision: 0 }, { ...found, cellCount: 3 },
  { ...found, ranges: [ranges[0], ranges[0]], cellCount: 6 },
  { ...found, scope: { ...scope, rowEnd: 100 } },
  { ...found, ranges: [{ ...ranges[0], colEnd: 8 }] },
])('invalid or stale native geometry is not clamped into a partial selection', async (result) => {
  const { store, locate } = await setup()
  const before = store.getter(selectionSnapshotAtom)
  locate.mockResolvedValueOnce(result)
  expect(await store.setter(runGoToSpecialAtom, 'blanks')).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  expect(store.getter(goToSpecialPanelAtom).error).toBeTruthy()
})

test('multi-region input is explicitly rejected rather than scanning only the primary region', async () => {
  const { store, locate } = await setup()
  store.setter(setMultiRegionSelectionAtom, { regions: ranges.map((range) => ({ kind: 'range', sheetId: 's',
    anchor: { row: range.rowStart, col: range.colStart },
    focus: { row: range.rowEnd, col: range.colEnd } })) })
  expect(await store.setter(runGoToSpecialAtom, 'constants')).toBe(false)
  expect(store.getter(goToSpecialPanelAtom).error).toContain('continuous range')
  expect(locate).not.toHaveBeenCalled()
})

test('format never sends a primary-only write after multi-area locating', async () => {
  const { store, request } = await setup()
  await store.setter(runGoToSpecialAtom, 'constants')
  request.mockClear()
  expect(await store.setter(applySelectionFormatAtom, 'bold')).toBe('blocked')
  expect(request).not.toHaveBeenCalled()
  expect(store.getter(selectionRangesAtom)).toEqual(ranges)
})
