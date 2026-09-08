import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  runSelectionVisibilityAtom,
  selectionVisibilityFeedbackAtom,
  viewportGeometrySizesAtom,
  viewportSizeOverridesAtom,
  dispatchKeyboardInputAtom,
  setSheetProtectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import { validSheetVisibility, applySheetVisibility } from '../src/viewport/hidden-state'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'

type Input = RustWorkbookCommands['range.visibility']['payload']
const hidden = { manualRows: [1, 2], manualColumns: [1], filterRows: [] }
async function setup() {
  const project = (input: VisibleProjectionRequest) => ({ ...input, cells: [], revision: 1 })
  const change = vi.fn(async (input: Input) => ({
    changed: true,
    projection: { ...project(input.projection), visibility: hidden },
  }))
  const request = vi.fn(async (command: string, input: unknown) =>
    command === 'range.visibility'
      ? change(input as Input)
      : project((input as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 1: 80 } },
    colWidthsBySheet: { s: { 1: 200 } },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  return { store, change, request }
}

test.each(['hide-rows', 'hide-columns', 'unhide', 'unhide-all'] as const)(
  '%s is one native request and never writes zero into stored sizes',
  async (action) => {
    const { store, change, request } = await setup()
    expect(await store.setter(runSelectionVisibilityAtom, action)).toBe(true)
    expect(change).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(2)
    expect(change.mock.calls[0]![0]).toMatchObject({
      action: action === 'unhide-all' ? 'unhide' : action,
      range:
        action === 'unhide-all'
          ? { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 7 }
          : { rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 },
    })
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.s?.[1]).toBe(80)
    expect(store.getter(viewportSizeOverridesAtom).colWidthsBySheet.s?.[1]).toBe(200)
    expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s?.[1]).toBe(0)
    expect(store.getter(viewportGeometrySizesAtom).colWidthsBySheet.s?.[1]).toBe(0)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 3, col: 2 })
  },
)

test('protection and malformed native results never change geometry, a failed command can retry', async () => {
  const { store, change } = await setup()
  const before = store.getter(viewportGeometrySizesAtom)
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await store.setter(runSelectionVisibilityAtom, 'hide-rows')).toBe(false)
  expect(change).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'open', unlockedRanges: [] },
  })
  change.mockImplementationOnce(async (input) => ({
    changed: true,
    projection: {
      ...input.projection,
      revision: 1,
      cells: [],
      visibility: { ...hidden, manualRows: [2, 1] },
    },
  }))
  expect(await store.setter(runSelectionVisibilityAtom, 'hide-rows')).toBe(false)
  expect(store.getter(viewportGeometrySizesAtom)).toBe(before)
  expect(store.getter(selectionVisibilityFeedbackAtom).error).toContain('mismatched')
  expect(await store.setter(runSelectionVisibilityAtom, 'hide-rows')).toBe(true)
})

test('pending native work blocks a second mutation without optimistically hiding anything', async () => {
  const { store, change } = await setup()
  let finish!: (value: Awaited<ReturnType<typeof change>>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = store.setter(runSelectionVisibilityAtom, 'hide-rows')
  expect(await store.setter(runSelectionVisibilityAtom, 'hide-columns')).toBe(false)
  expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s?.[1]).toBe(80)
  const input = change.mock.calls[0]![0]
  finish({
    changed: true,
    projection: { ...input.projection, revision: 1, cells: [], visibility: hidden },
  })
  expect(await first).toBe(true)
  expect(change).toHaveBeenCalledTimes(1)
})

test('arrow, shift selection, PageDown and boundary movement count only visible indices', async () => {
  const { store } = await setup()
  await store.setter(runSelectionVisibilityAtom, 'hide-rows')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  store.setter(dispatchKeyboardInputAtom, { key: 'ArrowDown', shiftKey: true })
  expect(store.getter(selectionSnapshotAtom).range).toMatchObject({ rowStart: 0, rowEnd: 3 })
  store.setter(dispatchKeyboardInputAtom, { key: 'PageDown', pageRowDelta: 2 })
  expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(5)
  store.setter(dispatchKeyboardInputAtom, { key: 'ArrowRight' })
  expect(store.getter(selectionSnapshotAtom).activeCell.col).toBe(2)
  store.setter(dispatchKeyboardInputAtom, { key: 'Home', ctrlKey: true })
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
})

test('hidden projections are sorted bounded arrays and restore defaults without changing sizes', async () => {
  const { store } = await setup()
  for (const manualRows of [[-1], [1, 1], [1.5], [1_048_576]])
    expect(validSheetVisibility({ ...hidden, manualRows })).toBe(false)
  // 原生快照的恢复路径只在测试中直接调用；生产由已关联的投影入口发布。
  const { atom } = await import('@einfach/core')
  const apply = atom(null, (get, set) =>
    applySheetVisibility(get, set, 's', { manualRows: [], manualColumns: [], filterRows: [] }),
  )
  await store.setter(runSelectionVisibilityAtom, 'hide-rows')
  store.setter(apply)
  expect(store.getter(viewportGeometrySizesAtom).rowHeightsBySheet.s?.[1]).toBe(80)
  expect(store.getter(viewportGeometrySizesAtom).colWidthsBySheet.s?.[1]).toBe(200)
})

test('startup freezes and validates hidden demo indices before asynchronous initialization', () => {
  const hiddenRows = [9, 2, 9]
  const sheet = { id: 's', name: 'S', rowCount: 100, colCount: 8, hiddenRows, hiddenColumns: [6] }
  const definition = { title: 'Test', sheets: [sheet], createImportChunks: () => [] }
  const snapshot = snapshotRustWorkbookDefinition(definition)
  hiddenRows[0] = 8
  expect(snapshot.sheets[0]?.hiddenRows).toEqual([2, 9])
  expect(snapshot.sheets[0]?.hiddenColumns).toEqual([6])
  expect(() =>
    snapshotRustWorkbookDefinition({ ...definition, sheets: [{ ...sheet, hiddenColumns: [8] }] }),
  ).toThrow('hidden index')
})
