import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { selectionSnapshotAtom } from '@einfach-excel/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

for (const source of ['cell', 'formula-bar']) {
  test(`${source} shares keyboard picking, F2 and a single final Rust write`, async () => {
    const connection = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(connection)
    const cell = await firstEditingCell()
    if (source === 'cell') fireEvent.doubleClick(cell)
    const input =
      source === 'cell'
        ? await focusedCellEditor()
        : screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
    act(() => input.focus())
    if (source === 'cell') fireEvent.change(input, { target: { value: '=SUM(' } })
    else fireEvent.input(input, { target: { value: '=SUM(' } })
    fireEvent.select(input)
    const selection = store.getter(selectionSnapshotAtom)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveValue('=SUM(A2')
    fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true })
    expect(input).toHaveValue('=SUM(A2:A3')
    fireEvent.keyDown(input, { key: 'F2' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveValue('=SUM(A2:A3')
    fireEvent.keyDown(input, { key: 'F2' })
    fireEvent.keyDown(input, { key: 'ArrowRight', isComposing: true })
    expect(input).toHaveValue('=SUM(A2:A3')
    expect(input).toHaveFocus()
    expect(store.getter(selectionSnapshotAtom)).toEqual(selection)
    expect(connection.setCellInput).not.toHaveBeenCalled()
    const value = '=SUM(A2:A3)'
    if (source === 'cell') fireEvent.change(input, { target: { value } })
    else fireEvent.input(input, { target: { value } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(connection.setCellInput).toHaveBeenCalledTimes(1))
    expect(connection.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({
        row: 0,
        col: 0,
        input: value,
      }),
    )
  })
}

test('a delayed formula commit does not steal focus from the next name-box interaction', async () => {
  const connection = createControlledCellEditingConnection()
  const originalWrite = connection.setCellInput.getMockImplementation()!
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  connection.setCellInput.mockImplementationOnce(async (request) => {
    await pending
    return originalWrite(request)
  })
  renderSalesOrdersEditingWorksheet(connection)
  fireEvent.doubleClick(await firstEditingCell())
  const input = await focusedCellEditor()
  fireEvent.change(input, { target: { value: '=COUNTA(B2:B3)' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(connection.setCellInput).toHaveBeenCalledTimes(1))
  const name = screen.getByRole('textbox', { name: 'Name box' })
  act(() => name.focus())
  fireEvent.input(name, { target: { value: 'B10' } })
  await act(async () => {
    release()
  })
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
  expect(name).toHaveFocus()
  expect(name).toHaveValue('B10')
})
