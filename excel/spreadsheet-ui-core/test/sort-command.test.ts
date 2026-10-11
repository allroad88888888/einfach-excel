import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, selectCellAtom, setSelectionBoundsAtom, runVisibleProjectionAtom,
  sortSelectionAtom, sortFeedbackAtom, projectionSnapshotAtom, setRustWorkbookConnectionAtom,
  setSheetProtectionAtom, addSelectionRegionAtom, configureSortAtom, sortPanelAtom,
  type RustWorkbookConnection, type RustWorkbookCommands, type VisibleProjectionRequest } from '../src'

type Input = RustWorkbookCommands['range.sort']['payload']
const result = (p: Input) => ({
  movedRows: 4, projection: { ...p.projection, cells: [], revision: 2 },
})
async function setup() {
  const sort = vi.fn(async (p: Input) => result(p))
  const request = vi.fn(async (command: string, p: unknown) => command === 'range.sort'
    ? sort(p as Input)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 10, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 20, col: 3 }, extend: true })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 } })
  return { store, sort, request }
}

test.each(['asc', 'desc'] as const)('%s sends one command, no cells or JS row mapping', async (direction) => {
  const { store, sort, request } = await setup()
  expect(await store.setter(sortSelectionAtom, direction)).toBe(true)
  expect(sort).toHaveBeenCalledTimes(1)
  expect(sort.mock.lastCall![0]).toMatchObject({ sheetId: 's',
    range: { rowStart: 10, rowEnd: 20, colStart: 1, colEnd: 3 },
    keys: [{ col: 1, direction }], hasHeader: false })
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(2)
})

test('single cell, protected sheet and multiple regions reject without transport', async () => {
  const { store, sort } = await setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 10, col: 1 } })
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(false)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 20, col: 3 }, extend: true })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(false)
  expect(store.getter(sortFeedbackAtom).error).toContain('Unprotect')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'unprotected', unlockedRanges: [] } })
  store.setter(addSelectionRegionAtom, { region: { kind: 'cell', sheetId: 's',
    anchor: { row: 30, col: 5 }, focus: { row: 32, col: 5 } } })
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(false)
  expect(store.getter(sortFeedbackAtom).error).toContain('continuous')
  expect(sort).not.toHaveBeenCalled()
})

test('pending sort blocks duplicate writes and a disposed connection cannot publish', async () => {
  const { store, sort } = await setup()
  let finish!: (value: ReturnType<typeof result>) => void
  sort.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const before = store.getter(projectionSnapshotAtom)
  const pending = store.setter(sortSelectionAtom, 'asc')
  expect(await store.setter(sortSelectionAtom, 'desc')).toBe(false)
  expect(sort).toHaveBeenCalledTimes(1)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish(result(sort.mock.lastCall![0]))
  expect(await pending).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(sortFeedbackAtom).busy).toBe(false)
})

test('native rejection and wrong projection preserve the view; retry succeeds', async () => {
  const { store, sort } = await setup()
  const before = store.getter(projectionSnapshotAtom)
  sort.mockRejectedValueOnce(new Error('Unmerge first'))
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(false)
  sort.mockImplementationOnce(async (p) => ({ ...result(p), projection: {
    ...result(p).projection, sheetId: 'wrong',
  } }))
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(await store.setter(sortSelectionAtom, 'asc')).toBe(true)
})

test('multi-column panel preserves key order and header option; cancel never writes', async () => {
  const { store, sort } = await setup()
  await store.setter(configureSortAtom, 'open')
  await store.setter(configureSortAtom, 'add')
  await store.setter(configureSortAtom, { type: 'key', index: 1, key: { col: 2, direction: 'desc' } })
  await store.setter(configureSortAtom, { type: 'header', value: true })
  expect(await store.setter(configureSortAtom, 'apply')).toBe(true)
  expect(sort.mock.lastCall![0]).toMatchObject({
    keys: [{ col: 1, direction: 'asc' }, { col: 2, direction: 'desc' }], hasHeader: true,
  })
  expect(store.getter(sortPanelAtom).target).toBeNull()
  await store.setter(configureSortAtom, 'open')
  await store.setter(configureSortAtom, 'close')
  expect(sort).toHaveBeenCalledTimes(1)
})

test('panel refuses changed selection and retains options on failure', async () => {
  const { store, sort } = await setup()
  await store.setter(configureSortAtom, 'open')
  sort.mockRejectedValueOnce(new Error('Array spill'))
  expect(await store.setter(configureSortAtom, 'apply')).toBe(false)
  expect(store.getter(sortPanelAtom).error).toBe('Array spill')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 30, col: 0 } })
  expect(await store.setter(configureSortAtom, 'apply')).toBe(false)
  expect(store.getter(sortPanelAtom).error).toContain('selection changed')
  expect(sort).toHaveBeenCalledTimes(1)
})

test('moving a level keeps its column and direction together and only Apply writes', async () => {
  const { store, sort } = await setup()
  await store.setter(configureSortAtom, 'open')
  await store.setter(configureSortAtom, 'add')
  await store.setter(configureSortAtom, 'add')
  await store.setter(configureSortAtom, { type: 'key', index: 1, key: { col: 2, direction: 'desc' } })
  await store.setter(configureSortAtom, { type: 'move', index: 1, direction: 'up' })
  await store.setter(configureSortAtom, { type: 'move', index: 1, direction: 'down' })
  expect(store.getter(sortPanelAtom).keys).toEqual([
    { col: 2, direction: 'desc' }, { col: 3, direction: 'asc' }, { col: 1, direction: 'asc' },
  ])
  for (const [index, direction] of [[0, 'up'], [2, 'down'], [-1, 'down'], [0.5, 'up']] as const)
    expect(await store.setter(configureSortAtom, { type: 'move', index, direction })).toBe(false)
  await store.setter(configureSortAtom, { type: 'case-sensitive', value: true })
  await store.setter(configureSortAtom, { type: 'empty-first', value: true })
  expect(sort).not.toHaveBeenCalled()
  sort.mockRejectedValueOnce(new Error('Native refusal'))
  expect(await store.setter(configureSortAtom, 'apply')).toBe(false)
  expect(store.getter(sortPanelAtom)).toMatchObject({ caseSensitive: true, emptyFirst: true })
  expect(await store.setter(configureSortAtom, 'apply')).toBe(true)
  expect(sort.mock.lastCall![0]).toMatchObject({ caseSensitive: true, emptyFirst: true,
    keys: [{ col: 2, direction: 'desc' }, { col: 3, direction: 'asc' }, { col: 1, direction: 'asc' }] })
})

test('cancel and reopen resets sort options; pending commands reject changes', async () => {
  const { store, sort } = await setup()
  await store.setter(configureSortAtom, 'open')
  await store.setter(configureSortAtom, { type: 'case-sensitive', value: true })
  await store.setter(configureSortAtom, { type: 'empty-first', value: true })
  await store.setter(configureSortAtom, 'close')
  await store.setter(configureSortAtom, 'open')
  expect(store.getter(sortPanelAtom)).toMatchObject({ caseSensitive: false, emptyFirst: false })
  let finish!: (value: ReturnType<typeof result>) => void
  sort.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(configureSortAtom, 'apply')
  expect(await store.setter(configureSortAtom, { type: 'empty-first', value: true })).toBe(false)
  expect(await store.setter(configureSortAtom, { type: 'case-sensitive', value: true })).toBe(false)
  expect(await store.setter(configureSortAtom, { type: 'move', index: 0, direction: 'down' })).toBe(false)
  finish(result(sort.mock.lastCall![0])); expect(await pending).toBe(true)
})
