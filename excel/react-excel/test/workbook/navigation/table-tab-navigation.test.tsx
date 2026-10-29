import { selectCellAtom, selectionSnapshotAtom, type NativeTable, type RustWorkbookCommands,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { projectionResultFor, renderSalesOrdersProjectionWorksheet } from '../../support/projection-harness'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import { focusedCellEditor } from '../../support/cell-editing-harness'

function setup() {
  let revision = 1
  let range = 'A1:B3'
  const tables = (): NativeTable[] => [{ name: 'Sales', sheet: 'Sales Orders', sheetIndex: 0,
    range, hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount'] }]
  const project = (input: VisibleProjectionRequest) => ({
    ...projectionResultFor(input), revision, tables: tables(),
  })
  const setCell = vi.fn(async (input: { sheetId: string; requestId: number }) =>
    ({ sheetId: input.sheetId, requestId: input.requestId, revision: ++revision }))
  const append = vi.fn(async (input: RustWorkbookCommands['table.change']['payload']) => {
    range = 'A1:B4'; revision++
    return { changed: true, projection: project(input.projection) }
  })
  const base = createTestRustWorkbookConnection({
    readVisibleProjection: async (input) => project(input),
    setCellInput: setCell, setCellProjection: async (input) => project(input) })
  const request = (async (command: string, payload: unknown) => command === 'table.change'
    ? append(payload as RustWorkbookCommands['table.change']['payload'])
    : base.request(command as 'projection.readVisible',
      payload as RustWorkbookCommands['projection.readVisible']['payload'])) as RustWorkbookConnection['request']
  const store = renderSalesOrdersProjectionWorksheet({ request, dispose() {} })
  const select = async (row: number, col: number) => {
    await screen.findByText('SO-10001')
    await act(async () => { store.setter(selectCellAtom, { coord: { row, col } }) })
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()
    return grid
  }
  const active = () => store.getter(selectionSnapshotAtom).activeCell
  return { append, setCell, select, active }
}
test('grid Tab wraps rows and Shift+Tab reverses with visible selection and retained focus', async () => {
  const { select, active, append } = setup()
  const grid = await select(1, 1)
  await act(async () => { fireEvent.keyDown(grid, { key: 'Tab' }) })
  expect(active()).toMatchObject({ row: 2, col: 0 })
  expect(document.querySelector('[data-cell="2:0"]')).toHaveAttribute('data-selected', 'true')
  await act(async () => { fireEvent.keyDown(grid, { key: 'Tab', shiftKey: true }) })
  expect(active()).toMatchObject({ row: 1, col: 1 })
  expect(grid).toHaveFocus()
  expect(append).not.toHaveBeenCalled()
})
test('cell editor Tab commits before append and returns focus to the new record', async () => {
  const { select, active, append, setCell } = setup()
  const grid = await select(2, 1)
  fireEvent.doubleClick(document.querySelector('[data-cell="2:1"]')!)
  const editor = await focusedCellEditor()
  fireEvent.change(editor, { target: { value: '42' } })
  await act(async () => { fireEvent.keyDown(editor, { key: 'Tab' }) })
  await waitFor(() => expect(active()).toMatchObject({ row: 3, col: 0 }))
  expect(setCell).toHaveBeenCalledTimes(1)
  expect(append).toHaveBeenCalledTimes(1)
  expect(setCell.mock.invocationCallOrder[0]).toBeLessThan(append.mock.invocationCallOrder[0])
  expect(grid).toHaveFocus()
})
test('failed keyboard append is announced outside the closed Table dialog', async () => {
  const { select, active, append } = setup()
  append.mockRejectedValueOnce(new Error('No space for another row'))
  const grid = await select(2, 1)
  await act(async () => { fireEvent.keyDown(grid, { key: 'Tab' }) })
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No space for another row'))
  expect(active()).toMatchObject({ row: 2, col: 1 })
  expect(grid).toHaveFocus()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
