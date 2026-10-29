import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  selectionRangesAtom, startEditingAtom, cancelEditingAtom, applyGoToTargetAtom,
  setViewportMetricsAtom, viewportMetricsAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { GoToSpecialTools } from '../../../src/workbook/chrome/ribbon/GoToSpecialTools'
import { SpreadsheetGrid } from '@einfach-excel/react-cells'
import { MergedCells } from '@einfach-excel/react-cells'

const scope = { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 7 }
const regions = [{ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
  { rowStart: 0, rowEnd: 0, colStart: 2, colEnd: 2 }]
async function setup() {
  const locate = vi.fn(async () => ({ scope, ranges: regions, cellCount: 5, revision: 1 }))
  const { store } = createSpreadsheetUi({ connection: {
    request: (async (command: string, input: unknown) => command === 'workbook.locate' ? locate()
      : { ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1,
        mergedRanges: [regions[0]], mergeAnchors: [{ row: 0, col: 0, displayValue: 'Merged',
          mergedSpan: { rows: 2, cols: 2 } }] }) as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  store.setter(setViewportMetricsAtom, { ...store.getter(viewportMetricsAtom),
    sheetId: 's', rowCount: 100, colCount: 8 })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  // 单格时查整个画布；选中合并格本身是多格范围，不应触发整表查询。
  store.setter(applyGoToTargetAtom, { sheetId: 's', coord: { row: 4, col: 4 } })
  const rendered = render(<WorkbookStoreProvider store={store}>
    <GoToSpecialTools />
    <SpreadsheetGrid cells={[]} window={{ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 3 }} />
    <MergedCells />
  </WorkbookStoreProvider>)
  return { store, locate, ...rendered }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

test.each(['Constants', 'Formulas', 'Blanks'])('%s renders every selected area and restores focus', async (label) => {
  const { store, container, locate } = await setup()
  click('Go to special')
  await screen.findByRole('dialog')
  expect(screen.getByText('Entire worksheet canvas: A1:H100')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Constants' })).toHaveFocus()
  click(label)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(store.getter(selectionRangesAtom)).toEqual(regions)
  expect(container.querySelectorAll('.selection-outline')).toHaveLength(2)
  expect(container.querySelector('td[data-cell="0:2"]')).toHaveAttribute('data-selected', 'true')
  expect(container.querySelector('td[data-cell="1:2"]')).not.toHaveAttribute('data-selected')
  expect(screen.getByRole('gridcell')).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'Go to special' })).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Selected 5 cells in 2 areas.')
  expect(locate).toHaveBeenCalledOnce()
})

test('empty results keep the dialog and selection; another condition retries successfully', async () => {
  const { store, locate } = await setup()
  const before = store.getter(selectionRangesAtom)
  locate.mockResolvedValueOnce({ scope, ranges: [], cellCount: 0, revision: 1 })
  click('Go to special')
  await screen.findByRole('dialog')
  click('Formulas')
  expect(await screen.findByRole('alert')).toHaveTextContent('No matching cells')
  expect(store.getter(selectionRangesAtom)).toEqual(before)
  click('Constants')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

test('editing blocks entry and cancellation during a pending query preserves selection', async () => {
  const { store, locate } = await setup()
  act(() => store.setter(startEditingAtom, { sheetId: 's', cell: { row: 4, col: 4 }, draft: '=SUM(', source: 'cell' }))
  expect(screen.getByRole('button', { name: 'Go to special' })).toBeDisabled()
  act(() => store.setter(cancelEditingAtom))
  let resolve!: (value: {
    scope: typeof scope; ranges: typeof regions; cellCount: number; revision: number
  }) => void
  locate.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const before = store.getter(selectionRangesAtom)
  click('Go to special')
  await screen.findByRole('dialog')
  click('Blanks')
  await screen.findByText('Locating cells…')
  expect(screen.getByRole('button', { name: 'Formulas' })).toBeDisabled()
  click('Cancel')
  await act(async () => resolve({ scope, ranges: regions, cellCount: 5, revision: 1 }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getter(selectionRangesAtom)).toEqual(before)
})
