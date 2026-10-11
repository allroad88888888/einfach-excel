import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  startEditingAtom, cancelEditingAtom, type RustWorkbookConnection,
  type VisibleProjectionRequest, type RustWorkbookCommands } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { CalculationTools } from '../../../src/workbook/chrome/ribbon/CalculationTools'
import { SpreadsheetGrid } from '../../../src/workbook/grid/cells/SpreadsheetGrid'

type Input = RustWorkbookCommands['formula.recalculate']['payload']
const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }
const cells = [{ row: 0, col: 0, displayValue: '50%', formula: '=1/2' },
  { row: 0, col: 1, displayValue: '=literal', inputText: "'=literal" }]
async function setup() {
  const calculate = vi.fn(async (input: Input) => ({ formulaCount: 2,
    projection: { ...input.projection, cells, revision: 2 } }))
  const request = vi.fn(async (command: string, input: unknown) => command === 'formula.recalculate'
    ? calculate(input as Input)
    : { ...(input as { request: VisibleProjectionRequest }).request, cells, revision: 1 })
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
  return { store, calculate, request, ...rendered }
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
