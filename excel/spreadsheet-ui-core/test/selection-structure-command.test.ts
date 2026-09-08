import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  workbookDocumentAtom,
  viewportMetricsAtom,
  viewportSizeOverridesAtom,
  setViewportMetricsAtom,
  runSelectionStructureAtom,
  selectionStructureFeedbackAtom,
  runRustHistoryAtom,
  runWorkbookSheetCommandAtom,
  setSheetProtectionAtom,
  setRustWorkbookConnectionAtom,
  startCellEditingFromProjectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import {
  STRUCTURE_ACTIONS,
  structureSheet,
  structureProjectionRequest,
  structureSizeRange,
} from '../src/rust-workbook/structure-geometry'

type Input = RustWorkbookCommands['sheet.editStructure']['payload']
const sheet = { id: 's', key: '1', index: 0, name: 'Orders', rowCount: 100, colCount: 8 }
const visibility = { manualRows: [], manualColumns: [], filterRows: [] }
const project = (p: VisibleProjectionRequest) => ({ ...p, cells: [], revision: 1, visibility })
const response = (input: Input) => {
  const next = structureSheet(sheet, input.edit)
  return {
    sheet: next,
    range: structureSizeRange(sheet, next),
    sizes: { rowHeights: [{ rowIndex: 90, heightPx: 60 }], colWidths: [] },
    projection: { ...project(structureProjectionRequest(input.projection, next)), revision: 2 },
  }
}
async function setup() {
  const change = vi.fn(async (input: Input) => response(input))
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'sheet.editStructure'
      ? change(payload as Input)
      : project((payload as { request: VisibleProjectionRequest }).request),
  )
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets: [sheet] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 99, col: 7 } })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom),
    sheetId: 's',
    rowCount: 100,
    colCount: 8,
    viewportHeight: 240,
    viewportWidth: 400,
    scrollTop: 99999,
    scrollLeft: 99999,
  })
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { s: { 99: 80 } },
    colWidthsBySheet: { s: { 7: 200 } },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 90, rowEnd: 99, colStart: 4, colEnd: 7 },
  })
  return { store, change, request }
}

test.each(STRUCTURE_ACTIONS)('%s synchronizes canvas and selection in one RPC', async (action) => {
  const { store, change, request } = await setup()
  expect(await store.setter(runSelectionStructureAtom, action)).toBe(true)
  expect(change).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledTimes(2)
  const input = change.mock.calls[0]![0]
  expect(input.edit).toEqual({ action, at: action.endsWith('rows') ? 99 : 7, count: 1 })
  const next = response(input).sheet
  expect(store.getter(workbookDocumentAtom).sheets[0]).toEqual(next)
  expect(store.getter(viewportMetricsAtom)).toMatchObject({
    rowCount: next.rowCount,
    colCount: next.colCount,
  })
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
    row: Math.min(99, next.rowCount - 1),
    col: Math.min(7, next.colCount - 1),
  })
  const sizes = store.getter(viewportSizeOverridesAtom)
  expect(sizes.rowHeightsBySheet.s?.[99]).toBeUndefined()
  expect(sizes.colWidthsBySheet.s?.[7]).toBeUndefined()
})

test('pending insertion blocks destructive commands without optimistic geometry', async () => {
  const { store, change } = await setup()
  let finish!: (value: ReturnType<typeof response>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const before = store.getter(workbookDocumentAtom)
  const pending = store.setter(runSelectionStructureAtom, 'insert-rows')
  expect(await store.setter(runSelectionStructureAtom, 'delete-rows')).toBe(false)
  expect(await store.setter(runRustHistoryAtom, 'undo')).toBe(false)
  expect(await store.setter(runWorkbookSheetCommandAtom, { operation: 'delete' })).toBe(false)
  expect(
    store.setter(startCellEditingFromProjectionAtom, {
      sheetId: 's',
      cell: { row: 99, col: 7 },
      source: 'cell',
    }),
  ).toBe(false)
  expect(store.getter(workbookDocumentAtom)).toBe(before)
  finish(response(change.mock.calls[0]![0]))
  expect(await pending).toBe(true)
})

test('failed native request preserves geometry and can retry', async () => {
  const { store, change } = await setup()
  const before = store.getter(workbookDocumentAtom)
  change.mockRejectedValueOnce(new Error('Overflow'))
  expect(await store.setter(runSelectionStructureAtom, 'insert-rows')).toBe(false)
  expect(store.getter(workbookDocumentAtom)).toBe(before)
  expect(store.getter(selectionStructureFeedbackAtom).error).toBe('Overflow')
  expect(await store.setter(runSelectionStructureAtom, 'insert-rows')).toBe(true)
})

test('protected reference sheets prevent structural writes', async () => {
  const { store, change } = await setup()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [sheet, { ...sheet, id: 'summary', key: '2', index: 1 }],
  })
  store.setter(setSheetProtectionAtom, {
    sheetId: 'summary',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await store.setter(runSelectionStructureAtom, 'delete-columns')).toBe(false)
  expect(change).not.toHaveBeenCalled()
  expect(store.getter(selectionStructureFeedbackAtom).error).toContain('Unprotect')
})

test('mismatched native metadata is rejected before publishing any canvas state', async () => {
  const { store, change } = await setup()
  const before = store.getter(workbookDocumentAtom)
  change.mockImplementationOnce(async (input) => {
    const result = response(input)
    return { ...result, sheet: { ...result.sheet, colCount: 1 } }
  })
  expect(await store.setter(runSelectionStructureAtom, 'insert-rows')).toBe(false)
  expect(store.getter(workbookDocumentAtom)).toBe(before)
})

test('an old runtime response cannot resize its replacement workbook', async () => {
  const { store, change } = await setup()
  let finish!: (value: ReturnType<typeof response>) => void
  change.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = store.setter(runSelectionStructureAtom, 'insert-rows')
  const before = store.getter(workbookDocumentAtom)
  store.setter(setRustWorkbookConnectionAtom, { request: vi.fn(), dispose() {} })
  finish(response(change.mock.calls[0]![0]))
  expect(await pending).toBe(false)
  expect(store.getter(workbookDocumentAtom)).toBe(before)
})
