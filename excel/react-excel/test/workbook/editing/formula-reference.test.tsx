import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { formulaReferenceSessionAtom, selectionSnapshotAtom } from '@einfach-excel/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection,
  dispatchEditingPointer,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

test('cell editor keeps focus while picking, cycles F4, and sends only the final formula to Rust', async () => {
  const controlled = createControlledCellEditingConnection()
  const store = renderSalesOrdersEditingWorksheet(controlled)
  await firstEditingCell()
  const grid = screen.getByLabelText('Sales Orders cells')
  grid.focus()
  fireEvent.keyDown(grid, { key: '=' })
  const input = await focusedCellEditor()
  fireEvent.select(input)
  const selection = store.getter(selectionSnapshotAtom)
  const picked = document.querySelector('[data-cell="1:1"]')!
  dispatchEditingPointer(picked, 'pointerdown', 1)
  dispatchEditingPointer(grid, 'pointerup', 1)
  expect(input).toHaveFocus()
  expect(input).toHaveValue('=B2')
  expect(store.getter(selectionSnapshotAtom)).toEqual(selection)
  expect(controlled.setCellInput).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'F4' })
  expect(input).toHaveValue('=$B$2')
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
  expect(controlled.setCellInput).toHaveBeenCalledWith(
    expect.objectContaining({ row: 0, col: 0, input: '=$B$2' }),
  )
  await waitFor(() => expect(store.getter(formulaReferenceSessionAtom)).toBeNull())
})

test('formula bar shares reference commands and Escape clears the pick without a write', async () => {
  const controlled = createControlledCellEditingConnection()
  const store = renderSalesOrdersEditingWorksheet(controlled)
  await firstEditingCell()
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
  act(() => input.focus())
  fireEvent.input(input, { target: { value: '=SUM(' } })
  const picked = document.querySelector('[data-cell="1:1"]')!
  dispatchEditingPointer(picked, 'pointerdown', 2)
  dispatchEditingPointer(screen.getByLabelText('Sales Orders cells'), 'pointerup', 2)
  expect(input).toHaveValue('=SUM(B2')
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { key: 'F4', isComposing: true })
  expect(input).toHaveValue('=SUM(B2')
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
  expect(controlled.setCellInput).not.toHaveBeenCalled()
})
