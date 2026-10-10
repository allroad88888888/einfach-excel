import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { editingSessionAtom } from '@einfach/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection, dispatchEditingPointer, firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

test.each(['cell', 'formula-bar'])(
  '%s draft survives switching, formula bar retains focus, only Enter writes original cell',
  async (source) => {
    const controlled = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(controlled)
    const cell = await firstEditingCell()
    const bar = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
    if (source === 'cell') {
      fireEvent.doubleClick(cell)
      fireEvent.change(screen.getByLabelText('Cell editor'), { target: { value: '=' } })
    } else {
      act(() => bar.focus())
      fireEvent.input(bar, { target: { value: '=' } })
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Summary' }))
      .toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryByLabelText('Cell editor')).toBeNull()
    expect(bar).toHaveValue('=')
    expect(bar).toHaveFocus()
    expect(screen.getByRole('button', { name: 'New sheet' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rename sheet' })).toBeDisabled()
    expect(controlled.setCellInput).not.toHaveBeenCalled()
    const grid = await screen.findByLabelText('Summary cells')
    dispatchEditingPointer(document.querySelector('[data-cell="0:1"]')!, 'pointerdown', 2)
    dispatchEditingPointer(grid, 'pointerup', 2)
    expect(bar).toHaveValue("='Summary'!B1")
    expect(store.getter(editingSessionAtom).source).toMatchObject({
      sheetId: 'orders', cell: { row: 0, col: 0 },
    })
    fireEvent.keyDown(bar, { key: 'Enter' })
    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(expect.objectContaining({
      sheetId: 'orders', row: 0, col: 0, input: "='Summary'!B1",
    }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Sales Orders' }))
      .toHaveAttribute('aria-selected', 'true'))
  },
)

test('rejected cross-sheet write stays correctable in formula bar; Escape returns without retry', async () => {
  const controlled = createControlledCellEditingConnection()
  renderSalesOrdersEditingWorksheet(controlled)
  await firstEditingCell()
  const bar = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
  act(() => bar.focus())
  fireEvent.input(bar, { target: { value: '=SUM(' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await screen.findByLabelText('Summary cells')
  controlled.failNextMutation('Invalid formula')
  fireEvent.keyDown(bar, { key: 'Enter' })
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not saved'))
  expect(bar).toHaveAttribute('aria-invalid', 'true')
  expect(bar).toHaveValue('=SUM(')
  expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(bar, { key: 'Escape' })
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Sales Orders' }))
    .toHaveAttribute('aria-selected', 'true'))
  expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
})
