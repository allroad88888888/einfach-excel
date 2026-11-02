import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  startEditingAtom, cancelEditingAtom, type RustWorkbookConnection,
  type VisibleProjectionRequest, type RustWorkbookCommands } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { CalculationTools } from '../../../src/workbook/chrome/ribbon/CalculationTools'
import { SpreadsheetGrid } from '@einfach-excel/react-cells'

type Input = RustWorkbookCommands['formula.recalculate']['payload']
type ModeInput = RustWorkbookCommands['formula.setCalculationMode']['payload']
type IterativeInput = RustWorkbookCommands['formula.setIterativeCalculation']['payload']
const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }
const cells = [{ row: 0, col: 0, displayValue: '50%', formula: '=1/2' },
  { row: 0, col: 1, displayValue: '=literal', inputText: "'=literal" }]
async function setup() {
  const calculate = vi.fn(async (input: Input) => ({ formulaCount: 2,
    projection: { ...input.projection, cells, revision: 2 } }))
  const setMode = vi.fn(async (input: ModeInput) => ({ mode: input.mode,
    projection: { ...input.projection, calculationMode: input.mode, cells, revision: 2 } }))
  const setIterative = vi.fn(async (input: IterativeInput) => {
    const iterativeCalculation = {
      enabled: input.enabled,
      maxIterations: input.maxIterations,
      maxChange: input.maxChange,
    }
    return {
      changed: true,
      iterativeCalculation,
      projection: { ...input.projection, iterativeCalculation, cells, revision: 2 },
    }
  })
  const request = vi.fn(async (command: string, input: unknown) => {
    if (command === 'formula.recalculate') return calculate(input as Input)
    if (command === 'formula.setCalculationMode') return setMode(input as ModeInput)
    if (command === 'formula.setIterativeCalculation') return setIterative(input as IterativeInput)
    return { ...(input as { request: VisibleProjectionRequest }).request, calculationMode: 'automatic', cells, revision: 1 }
  })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport', window })
  const rendered = render(<WorkbookStoreProvider store={store}>
    <CalculationTools /><SpreadsheetGrid window={window} cells={cells} />
  </WorkbookStoreProvider>)
  return { store, calculate, setMode, setIterative, request, ...rendered }
}

test.each(['sheet', 'workbook'])('%s select dispatches one calculation with accessible success feedback', async (scope) => {
  const { calculate } = await setup()
  fireEvent.change(screen.getByRole('combobox', { name: 'Recalculate' }), { target: { value: scope } })
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('recalculated (2 formulas)'))
  expect(calculate).toHaveBeenCalledOnce()
  expect(calculate.mock.lastCall![0].scope).toBe(scope)
  expect(screen.getByRole('combobox', { name: 'Recalculate' })).toBeEnabled()
})
test('formula toggle changes displayed text only and does not dispatch a Worker request', async () => {
  const { request, container } = await setup()
  const toggle = screen.getByRole('button', { name: 'Show formulas' })
  const cell = container.querySelector('[data-cell="0:0"]')!
  expect(cell).toHaveTextContent('50%')
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(cell).toHaveTextContent('=1/2')
  expect(cell).toHaveAttribute('title', '=1/2')
  expect(container.querySelector('[data-cell="0:1"]')).toHaveTextContent('=literal')
  fireEvent.click(toggle)
  expect(cell).toHaveTextContent('50%')
  expect(request).toHaveBeenCalledTimes(1)
})
test('draft disables both controls; native error is visible and retry succeeds', async () => {
  const { store, calculate } = await setup()
  act(() => store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: '=SUM(' }))
  expect(screen.getByRole('combobox', { name: 'Recalculate' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Show formulas' })).toBeDisabled()
  act(() => store.setter(cancelEditingAtom))
  calculate.mockRejectedValueOnce(new Error('Native failure'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Recalculate' }), { target: { value: 'sheet' } })
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Native failure'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Recalculate' }), { target: { value: 'workbook' } })
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.getByRole('status')).toHaveTextContent('Workbook recalculated')
})
test('calculation mode select switches between Automatic and Manual', async () => {
  const { setMode } = await setup()
  const modeSelect = screen.getByRole('combobox', { name: 'Calculation mode' })
  expect(modeSelect).toHaveValue('automatic')
  fireEvent.change(modeSelect, { target: { value: 'manual' } })
  await waitFor(() => expect(modeSelect).toHaveValue('manual'))
  expect(setMode).toHaveBeenCalledOnce()
  expect(setMode.mock.lastCall![0].mode).toBe('manual')
  expect(screen.getByRole('status')).toHaveTextContent('Calculation mode set to Manual.')
})
test('iterative calculation controls toggle enabled and update maxIterations and maxChange', async () => {
  const { setIterative } = await setup()
  const toggle = screen.getByTestId('iterative-calculation-toggle')
  const maxIterInput = screen.getByTestId('iterative-max-iterations')
  const maxChangeInput = screen.getByTestId('iterative-max-change')
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'))
  expect(setIterative).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true, maxIterations: 100, maxChange: 0.001 }),
  )
  fireEvent.change(maxIterInput, { target: { value: '20' } })
  await waitFor(() =>
    expect(setIterative).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, maxIterations: 20, maxChange: 0.001 }),
    ),
  )
  fireEvent.change(maxChangeInput, { target: { value: '0.05' } })
  await waitFor(() =>
    expect(setIterative).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, maxIterations: 20, maxChange: 0.05 }),
    ),
  )
})

