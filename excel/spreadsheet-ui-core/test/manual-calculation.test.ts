import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  projectionSnapshotAtom, setRustWorkbookConnectionAtom, setSheetProtectionAtom,
  calculationAvailableAtom, calculationFeedbackAtom, calculationModeAtom,
  recalculateAtom, setCalculationModeAtom, dispatchGridCellKeyboardInputAtom,
  startEditingAtom, editingSessionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['formula.recalculate']['payload']
type ModeInput = RustWorkbookCommands['formula.setCalculationMode']['payload']
const result = (input: Input) => ({ formulaCount: 3,
  projection: { ...input.projection, cells: [{ row: 0, col: 0, displayValue: '8', formula: '=RAND()' }], revision: 2 } })
async function setup() {
  const calculate = vi.fn(async (input: Input) => result(input))
  const setMode = vi.fn(async (input: ModeInput) => ({ mode: input.mode,
    projection: { ...input.projection, calculationMode: input.mode, cells: [{ row: 0, col: 0, displayValue: '8', formula: '=RAND()' }], revision: 2 } }))
  const request = vi.fn(async (command: string, input: unknown) => {
    if (command === 'formula.recalculate') return calculate(input as Input)
    if (command === 'formula.setCalculationMode') return setMode(input as ModeInput)
    return { ...(input as { request: VisibleProjectionRequest }).request, calculationMode: 'automatic', cells: [], revision: 1 }
  })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  return { store, calculate, setMode, request }
}

test.each(['sheet', 'workbook'] as const)('%s makes one native request and publishes bundled projection on a protected sheet', async (scope) => {
  const { store, calculate, request } = await setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await store.setter(recalculateAtom, scope)).toBe(true)
  expect(calculate).toHaveBeenCalledOnce()
  expect(calculate.mock.lastCall![0]).toMatchObject({ scope, projection: { sheetId: 's' } })
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(projectionSnapshotAtom).result?.cells[0]?.displayValue).toBe('8')
  expect(store.getter(calculationFeedbackAtom).message).toContain('3 formulas')
})

test('draft is preserved and disables calculation', async () => {
  const { store, calculate } = await setup()
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: '=SUM(' })
  expect(store.getter(calculationAvailableAtom)).toBe(false)
  expect(await store.setter(recalculateAtom, 'sheet')).toBe(false)
  expect(calculate).not.toHaveBeenCalled()
  expect(store.getter(editingSessionAtom).draft).toBe('=SUM(')
})

test.each(['disconnect', 'new-window'] as const)('late result after %s does not replace current projection', async (change) => {
  const { store, calculate } = await setup()
  let finish!: (reply: ReturnType<typeof result>) => void
  calculate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(recalculateAtom, 'sheet')
  expect(store.getter(calculationAvailableAtom)).toBe(false)
  expect(await store.setter(recalculateAtom, 'workbook')).toBe(false)
  if (change === 'disconnect') store.setter(setRustWorkbookConnectionAtom, null)
  else await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 10, rowEnd: 19, colStart: 0, colEnd: 7 } })
  const before = store.getter(projectionSnapshotAtom)
  finish(result(calculate.mock.lastCall![0]))
  await pending
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(calculationFeedbackAtom).busy).toBe(false)
})

test('errors and malformed metadata preserve projection and permit retry', async () => {
  const { store, calculate } = await setup()
  const before = store.getter(projectionSnapshotAtom)
  calculate.mockRejectedValueOnce(new Error('Native failure'))
  expect(await store.setter(recalculateAtom, 'sheet')).toBe(false)
  expect(store.getter(calculationFeedbackAtom).error).toBe('Native failure')
  calculate.mockImplementationOnce(async (input) => ({ ...result(input), formulaCount: -1 }))
  expect(await store.setter(recalculateAtom, 'workbook')).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(await store.setter(recalculateAtom, 'workbook')).toBe(true)
})

test('setCalculationModeAtom switches between automatic and manual and syncs calculationModeAtom', async () => {
  const { store, setMode } = await setup()
  expect(store.getter(calculationModeAtom)).toBe('automatic')
  expect(await store.setter(setCalculationModeAtom, 'manual')).toBe(true)
  expect(setMode).toHaveBeenCalledOnce()
  expect(store.getter(calculationModeAtom)).toBe('manual')
  expect(store.getter(calculationFeedbackAtom).message).toBe('Calculation mode set to Manual.')
  expect(await store.setter(setCalculationModeAtom, 'automatic')).toBe(true)
  expect(store.getter(calculationModeAtom)).toBe('automatic')
  expect(store.getter(calculationFeedbackAtom).message).toBe('Calculation mode set to Automatic.')
})

test('F9 and Shift+F9 trigger workbook and sheet recalculation in grid navigation mode only', async () => {
  const { store, calculate } = await setup()
  expect(store.setter(dispatchGridCellKeyboardInputAtom, {
    sheetId: 's',
    cell: { row: 0, col: 0 },
    keyboard: { key: 'F9' },
    allowEditing: true,
  })).toEqual({ type: 'calculation.recalculate', scope: 'workbook' })
  await vi.waitFor(() => expect(store.getter(calculationAvailableAtom)).toBe(true))
  expect(calculate).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'workbook' }))

  expect(store.setter(dispatchGridCellKeyboardInputAtom, {
    sheetId: 's',
    cell: { row: 0, col: 0 },
    keyboard: { key: 'F9', shiftKey: true },
    allowEditing: true,
  })).toEqual({ type: 'calculation.recalculate', scope: 'sheet' })
  await vi.waitFor(() => expect(store.getter(calculationAvailableAtom)).toBe(true))
  expect(calculate).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'sheet' }))

  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: '=A1' })
  expect(store.setter(dispatchGridCellKeyboardInputAtom, {
    sheetId: 's',
    cell: { row: 0, col: 0 },
    keyboard: { key: 'F9' },
    allowEditing: true,
  })).toEqual({ type: 'none', reason: 'editing-text-navigation' })
  expect(calculate).toHaveBeenCalledTimes(2)
})

