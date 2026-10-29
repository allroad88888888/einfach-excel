import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { selectionSnapshotAtom, setSelectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection, firstEditingCell, renderSalesOrdersEditingWorksheet,
} from '../support/cell-editing-harness'

test('tab buttons restore each sheet selection through the existing command atoms', async () => {
  const connection = createControlledCellEditingConnection()
  const store = renderSalesOrdersEditingWorksheet(connection)
  await firstEditingCell()
  act(() => store.setter(setSelectionAtom, {
    kind: 'range', sheetId: 'orders', anchor: { row: 1, col: 2 }, focus: { row: 2, col: 3 },
  }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('C2:D3'))
  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1'))
  fireEvent.click(await screen.findByRole('columnheader', { name: 'Select column B' }))
  await waitFor(() => expect(store.getter(selectionSnapshotAtom).selection).toMatchObject({
    kind: 'column', sheetId: 'summary', colAnchor: 1, colFocus: 1,
  }))
  fireEvent.click(screen.getByRole('tab', { name: 'Sales Orders' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('C2:D3'))
  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await waitFor(() => expect(screen.getByRole('columnheader', {
    name: 'Select column B',
  })).toHaveAttribute('aria-selected', 'true'))
  expect(store.getter(selectionSnapshotAtom).selection).toMatchObject({ kind: 'column', colFocus: 1 })
  expect(connection.setCellInput).not.toHaveBeenCalled()
})
