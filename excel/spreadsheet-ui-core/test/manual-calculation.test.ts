import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  projectionSnapshotAtom, setRustWorkbookConnectionAtom, setSheetProtectionAtom,
  calculationAvailableAtom, calculationFeedbackAtom, recalculateAtom,
  startEditingAtom, editingSessionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'

type Input = RustWorkbookCommands['formula.recalculate']['payload']
const result = (input: Input) => ({ formulaCount: 3,
  projection: { ...input.projection, cells: [{ row: 0, col: 0, displayValue: '8', formula: '=RAND()' }], revision: 2 } })
async function setup() {
  const calculate = vi.fn(async (input: Input) => result(input))
  const request = vi.fn(async (command: string, input: unknown) => command === 'formula.recalculate'
    ? calculate(input as Input)
    : { ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  return { store, calculate, request }
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
