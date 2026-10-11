import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type NativeTable, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FilterTools } from '../../../src/workbook/chrome/ribbon/FilterTools'
import { SpreadsheetGrid } from '../../../src/workbook/grid/cells/SpreadsheetGrid'

type Input = RustWorkbookCommands['table.change']['payload']
const window = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 }
const menu = () => screen.getByRole('combobox', { name: 'Worksheet filter' })
const header = (name = 'North') => screen.getByRole('button', { name: `Filter ${name} column B` })
async function setup() {
  let revision = 1
  let tables: NativeTable[] = ['North', 'South'].map((name, index) => ({ name,
    sheet: 'Sheet', sheetIndex: 0, range: index ? 'A7:B10' : 'A1:B4',
    hasHeaders: true, hasTotals: false, columns: ['Item', 'Amount'],
  }))
  const project = (request: VisibleProjectionRequest) => ({ ...request, revision, tables,
    cells: [], filterRules: [], visibility: { manualRows: [], manualColumns: [], filterRows: [] } })
  const change = vi.fn(async (input: Input) => {
    const action = input.action
    if (action.kind === 'filter' || action.kind === 'clear-filter') {
      tables = tables.map((table) => table.name !== action.name ? table : { ...table,
        autoFilter: action.kind === 'filter' && action.rules.length ? { rules: action.rules } : undefined })
    }
    revision++
    return { changed: true, projection: project(input.projection) }
  })
  const request = (async (command: string, input: unknown) => command === 'table.change'
    ? change(input as Input)
    : project((input as { request: VisibleProjectionRequest }).request)) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <FilterTools /><SpreadsheetGrid window={window} cells={[]} />
  </WorkbookStoreProvider>)
  await act(async () => { await store.setter(runVisibleProjectionAtom, { sheetId: 's', window }) })
  return { change, store }
}
async function click(button: HTMLElement) {
  await act(async () => { button.focus(); fireEvent.click(button) })
}
async function fill(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}
async function choose(value: string) {
  await act(async () => { menu().focus(); fireEvent.change(menu(), { target: { value } }) })
}
async function apply() {
  await act(async () => { fireEvent.submit(screen.getByRole('dialog').querySelector('form')!) })
}

test('table header edits its own column, displays its scope and restores header focus', async () => {
  const { change } = await setup()
  await click(header('South'))
  expect(screen.getByRole('dialog', { name: 'South filter conditions' })).toHaveTextContent('headers and totals are excluded')
  expect(screen.getByLabelText('Filter column 1')).toBeDisabled()
  await fill('Filter condition 1', 'range')
  await fill('Minimum 1', '20')
  await apply()
  expect(change.mock.lastCall![0].action).toEqual({ kind: 'filter', name: 'South',
    rules: [{ kind: 'range', colIndex: 1, min: 20 }] })
  expect(header('South')).toHaveFocus()
  expect(header('South')).toHaveAttribute('data-filtered', 'true')
  expect(header()).toHaveAttribute('data-filtered', 'false')
  await click(header('South'))
  expect(screen.getByLabelText('Minimum 1')).toHaveValue('20')
  await click(screen.getByRole('button', { name: 'Clear column B filter' }))
  expect(change.mock.lastCall![0].action).toEqual({ kind: 'filter', name: 'South', rules: [] })
  expect(header('South')).toHaveAttribute('data-filtered', 'false')
  expect(header('South')).toHaveFocus()
})

test('toolbar names the selected table and dispatches only its reapply or clear command', async () => {
  const { store, change } = await setup()
  await click(header())
  await fill('Filter value 1', 'North')
  await apply()
  expect(screen.getByRole('option', { name: 'Reapply North filter' })).toBeEnabled()
  await choose('reapply')
  expect(change.mock.lastCall![0].action).toEqual({ kind: 'reapply-filter', name: 'North' })
  await choose('clear')
  expect(change.mock.lastCall![0].action).toEqual({ kind: 'clear-filter', name: 'North' })
  expect(menu()).toHaveFocus()
  await act(async () => { store.setter(selectCellAtom, { sheetId: 's', coord: { row: 6, col: 0 } }) })
  expect(screen.getByRole('option', { name: 'South filter conditions…' })).toBeEnabled()
  expect(screen.getByRole('option', { name: 'Reapply South filter' })).toBeDisabled()
  await choose('open')
  expect(screen.getByRole('dialog', { name: 'South filter conditions' })).toBeInTheDocument()
})

test('native rejection keeps the table draft editable and cancel returns to the header', async () => {
  const { change } = await setup()
  await click(header())
  await fill('Filter value 1', 'Keep')
  change.mockRejectedValueOnce(new Error('Filter source exceeds the scan budget.'))
  await apply()
  expect(screen.getByRole('dialog')).toHaveTextContent('exceeds the scan budget')
  expect(screen.getByLabelText('Filter value 1')).toHaveValue('Keep')
  await click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(header()).toHaveFocus()
})
