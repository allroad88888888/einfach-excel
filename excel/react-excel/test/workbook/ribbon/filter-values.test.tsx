import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
  type ColumnFilterRule } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FilterTools } from '../../../src/workbook/chrome/ribbon/FilterTools'

type Query = RustWorkbookCommands['sheet.filterValues']['payload']
type Filter = RustWorkbookCommands['sheet.filter']['payload']
const items = Array.from({ length: 51 }, (_, i) => i === 0 ? '' : i === 1 ? 'two\nlines' : `Item ${i}`)
const click = async (name: string) => act(async () => {
  fireEvent.click(screen.getByRole('button', { name }))
})
async function setup() {
  let revision = 0
  let rules: readonly ColumnFilterRule[] = []
  const query = vi.fn(async (input: Query) => {
    const values = items.filter((value) => value.toLowerCase().includes(input.search.toLowerCase()))
    return { revision, total: values.length, offset: Math.min(values.length, input.offset),
      values: values.slice(input.offset, input.offset + input.limit)
        .map((value) => ({ value, count: 2 })) }
  })
  const project = (request: VisibleProjectionRequest) => ({ ...request, revision, cells: [],
    filterRules: rules, filterRange: { rowStart: 0, rowEnd: 200, colStart: 0, colEnd: 1 },
    visibility: { manualRows: [], manualColumns: [], filterRows: [] },
  })
  const filter = vi.fn(async (input: Filter) => {
    if (input.action === 'apply') rules = input.rules
    revision++
    return { hiddenRows: 0, projection: project(input.projection) }
  })
  const request = (async (command: string, input: unknown) => command === 'sheet.filterValues'
    ? query(input as Query) : command === 'sheet.filter' ? filter(input as Filter)
      : project((input as { request: VisibleProjectionRequest }).request)) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 300, colCount: 8 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <FilterTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, { sheetId: 's',
      window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 7 } })
  })
  const open = async () => act(async () => {
    const menu = screen.getByRole('combobox', { name: 'Worksheet filter' })
    menu.focus(); fireEvent.change(menu, { target: { value: 'open' } })
  })
  await open()
  return { query, filter, open }
}

test('checkboxes retain selection across native pages and Apply commits once with focus restored', async () => {
  const { filter } = await setup()
  await click('Choose values for condition 1')
  expect(screen.getByLabelText('Filter values page')).toHaveTextContent('1–50 of 51')
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Select value (Blanks)' })) })
  await click('Next filter values page')
  expect(screen.getByLabelText('Filter values page')).toHaveTextContent('51–51 of 51')
  expect(screen.getByRole('button', { name: 'Next filter values page' })).toBeDisabled()
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Select value Item 50' })) })
  await click('Previous filter values page')
  expect(screen.getByRole('checkbox', { name: 'Select value (Blanks)' })).toBeChecked()
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('2 selected')
  expect(filter).not.toHaveBeenCalled()
  await click('Apply filter')
  expect(filter).toHaveBeenCalledTimes(1)
  expect(filter.mock.lastCall![0]).toMatchObject({ rules: [{ kind: 'list', colIndex: 0, values: ['', 'Item 50'] }] })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('combobox', { name: 'Worksheet filter' })).toHaveFocus()
})

test('search Enter only queries values; no results and native failures are correctable without writing', async () => {
  const { query, filter } = await setup()
  await click('Choose values for condition 1')
  const search = screen.getByRole('searchbox', { name: 'Search filter values' })
  await act(async () => { fireEvent.change(search, { target: { value: 'missing' } }) })
  expect(query).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.keyDown(search, { key: 'Enter' }) })
  expect(screen.getByText('No matching values. Try another search.')).toBeVisible()
  expect(filter).not.toHaveBeenCalled()
  await act(async () => { fireEvent.change(search, { target: { value: 'Item 50' } }) })
  query.mockRejectedValueOnce(new Error('Native query unavailable'))
  await click('Search')
  expect(screen.getByRole('alert')).toHaveTextContent('Native query unavailable')
  await click('Retry values')
  expect(screen.getByRole('checkbox', { name: 'Select value Item 50' })).toBeVisible()
  await click('Cancel')
  expect(filter).not.toHaveBeenCalled()
  expect(screen.getByRole('combobox', { name: 'Worksheet filter' })).toHaveFocus()
})

test('a multiline candidate remains one checkbox and reopens without splitting its submitted value', async () => {
  const { filter, open } = await setup()
  await click('Choose values for condition 1')
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Select value two\s+lines/ })) })
  await click('Hide values for condition 1')
  expect(screen.getByLabelText('Filter value 1')).toHaveAttribute('readonly')
  await click('Apply filter')
  expect(filter.mock.lastCall![0]).toMatchObject({ rules: [{ kind: 'list', values: ['two\nlines'] }] })
  await open(); await click('Choose values for condition 1')
  expect(screen.getByRole('checkbox', { name: /Select value two\s+lines/ })).toBeChecked()
  expect(screen.getByLabelText('Selected filter values')).toHaveTextContent('1 selected')
})
