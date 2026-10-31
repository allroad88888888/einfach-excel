import { expect, test, vi } from 'vitest'
import {
  chooseShiftCellsOptionAtom,
  closeShiftCellsDialogAtom,
  confirmShiftCellsAtom,
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  openCellContextMenuAtom,
  openShiftCellsDialogAtom,
  cellContextMenuAtom,
  runVisibleProjectionAtom,
  selectionAtom,
  setSheetProtectionAtom,
  shiftCellsDialogAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['range.shiftCells']['payload']
const range = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 1 }
const project = (p: VisibleProjectionRequest) => ({ ...p, revision: 1, cells: [] })

async function setup() {
  const shift = vi.fn(async (input: Input) => ({
    changed: true,
    projection: project(input.projection),
  }))
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'range.shiftCells') return shift(payload as Input)
    if (command === 'sheet.editStructure') throw new Error('STRUCTURE_CALLED')
    return project((payload as { request: VisibleProjectionRequest }).request)
  })
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Test',
    sheets: [{ id: 's', key: '1', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 1, col: 1 },
    focus: { row: 2, col: 1 },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 5 },
    reason: 'test',
  })
  return { store, request, shift }
}

test.each([
  ['insert', 'shift-right', 'insert-right'],
  ['insert', 'shift-down', 'insert-down'],
  ['delete', 'shift-left', 'delete-left'],
  ['delete', 'shift-up', 'delete-up'],
] as const)('%s %s sends one native %s request and closes', async (mode, choice, direction) => {
  const r = await setup()
  expect(await r.store.setter(openShiftCellsDialogAtom, { mode })).toBe(true)
  expect(r.store.getter(shiftCellsDialogAtom).choice).toBe(
    mode === 'insert' ? 'shift-down' : 'shift-up',
  )
  expect(r.store.setter(chooseShiftCellsOptionAtom, choice)).toBe(true)
  expect(await r.store.setter(confirmShiftCellsAtom)).toBe(true)
  expect(r.shift).toHaveBeenCalledTimes(1)
  expect(r.shift.mock.calls[0][0]).toMatchObject({ sheetId: 's', range, direction })
  expect(r.store.getter(shiftCellsDialogAtom).mode).toBeNull()
})

test('options outside the open dialog are refused', async () => {
  const r = await setup()
  await r.store.setter(openShiftCellsDialogAtom, { mode: 'insert' })
  expect(r.store.setter(chooseShiftCellsOptionAtom, 'shift-left')).toBe(false)
  expect(r.store.getter(shiftCellsDialogAtom).choice).toBe('shift-down')
  expect(r.store.setter(closeShiftCellsDialogAtom)).toBe(true)
  expect(r.store.getter(shiftCellsDialogAtom).mode).toBeNull()
})

test('native rejection keeps the dialog open with the Rust message', async () => {
  const r = await setup()
  r.shift.mockRejectedValueOnce(new Error('Cannot shift cells through part of a merged cell.'))
  await r.store.setter(openShiftCellsDialogAtom, { mode: 'insert' })
  expect(await r.store.setter(confirmShiftCellsAtom)).toBe(false)
  expect(r.store.getter(shiftCellsDialogAtom)).toMatchObject({
    mode: 'insert',
    busy: false,
    error: 'Cannot shift cells through part of a merged cell.',
  })
})

test('protected worksheets never reach Rust', async () => {
  const r = await setup()
  r.store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  await r.store.setter(openShiftCellsDialogAtom, { mode: 'delete' })
  expect(await r.store.setter(confirmShiftCellsAtom)).toBe(false)
  expect(r.shift).not.toHaveBeenCalled()
  expect(r.store.getter(shiftCellsDialogAtom).error).toBe(
    'Unprotect the worksheets before inserting or deleting cells.',
  )
})

test('keyboard on whole rows runs the row command instead of opening the dialog', async () => {
  const r = await setup()
  r.store.setter(selectionAtom, { kind: 'row', sheetId: 's', rowAnchor: 1, rowFocus: 1 })
  await r.store.setter(openShiftCellsDialogAtom, { mode: 'insert', source: 'keyboard' })
  expect(r.store.getter(shiftCellsDialogAtom).mode).toBeNull()
  expect(r.request.mock.calls.some(([command]) => command === 'sheet.editStructure')).toBe(true)
})

test('context menu opens at the pointer and closes when a dialog opens', async () => {
  const r = await setup()
  expect(r.store.setter(openCellContextMenuAtom, { x: 40, y: 50 })).toBe(true)
  expect(r.store.getter(cellContextMenuAtom)).toEqual({ x: 40, y: 50 })
  await r.store.setter(openShiftCellsDialogAtom, { mode: 'insert', source: 'menu' })
  expect(r.store.getter(cellContextMenuAtom)).toBeNull()
})
