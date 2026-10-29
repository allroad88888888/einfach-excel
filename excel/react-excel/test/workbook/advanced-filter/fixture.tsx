import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
  type ColumnFilterGroup, type ColumnFilterRule } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FilterTools } from '../../../src/workbook/chrome/ribbon/FilterTools'

type Filter = RustWorkbookCommands['sheet.filter']['payload']
type Query = RustWorkbookCommands['sheet.filterValues']['payload']
export const click = async (name: string) => act(async () => {
  fireEvent.click(screen.getByRole('button', { name }))
})
export const change = async (name: string, value: string) => act(async () => {
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
})

export async function setup() {
  let revision = 1
  let groups: readonly ColumnFilterGroup[] = []
  let rules: readonly ColumnFilterRule[] = []
  const items = Array.from({ length: 120 }, (_, index) => `Order ${String(index + 1).padStart(3, '0')}`)
  const values = vi.fn(async (input: Query) => {
    const matching = items.filter((value) =>
      value.toLowerCase().includes(input.search.toLowerCase()))
    return { revision, total: matching.length, offset: Math.min(input.offset, matching.length),
      values: matching.slice(input.offset,
        input.allMatches ? undefined : input.offset + input.limit)
        .map((value) => ({ value, count: 1 })) }
  })
  const project = (request: VisibleProjectionRequest) => ({ ...request, cells: [], revision,
    filterRules: rules, filterGroups: groups,
    filterRange: { rowStart: 0, rowEnd: 120, colStart: 0, colEnd: 3 },
    visibility: { manualRows: [], manualColumns: [], filterRows: [] },
  })
  const filter = vi.fn(async (input: Filter) => {
    if (input.action === 'apply') { groups = input.groups ?? []; rules = input.rules }
    revision++
    return { hiddenRows: 0, projection: project(input.projection) }
  })
  const request = (async (command: string, input: unknown) => command === 'sheet.filter'
    ? filter(input as Filter) : command === 'sheet.filterValues' ? values(input as Query)
      : project((input as { request: VisibleProjectionRequest }).request)) as RustWorkbookConnection['request']
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', index: 0, rowCount: 200, colCount: 4 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  render(<WorkbookStoreProvider store={store} connection={{ request, dispose() {} }}>
    <FilterTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, { sheetId: 's',
      window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 3 } })
  })
  const open = async () => act(async () => {
    const menu = screen.getByRole('combobox', { name: 'Worksheet filter' })
    menu.focus(); fireEvent.change(menu, { target: { value: 'open' } })
  })
  await open()
  return { store, filter, values, open }
}
