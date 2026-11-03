import { act, fireEvent, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { editingSessionAtom, setSheetProtectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection, firstEditingCell, renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

test('locked cell has a selectable read-only formula bar and never mounts an editor', async () => {
  const controlled = createControlledCellEditingConnection()
  const store = renderSalesOrdersEditingWorksheet(controlled)
  const cell = await firstEditingCell()
  act(() => store.setter(setSheetProtectionAtom, {
    sheetId: 'orders', state: { mode: 'protected', unlockedRanges: [] },
  }))
  const bar = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Active cell value' })
  expect(bar).toHaveAttribute('readonly')
  expect(bar).toBeEnabled()
  act(() => bar.focus())
  expect(bar).toHaveFocus()
  expect(store.getter(editingSessionAtom).source).toBeNull()
  const grid = screen.getByLabelText('Sales Orders cells')
  act(() => grid.focus())
  fireEvent.doubleClick(cell)
  expect(screen.getByRole('alertdialog')).toHaveTextContent('This worksheet is protected.')
  expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(grid).toHaveFocus()
  fireEvent.keyDown(grid, { key: 'F2' })
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(grid).toHaveFocus()
  fireEvent.keyDown(grid, { key: '9' })
  expect(screen.queryByLabelText('Cell editor')).toBeNull()
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(screen.getByRole('alertdialog')).toHaveTextContent('This worksheet is protected.')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(controlled.setCellInput).not.toHaveBeenCalled()
  expect(screen.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute('data-read-only', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  act(() => store.setter(setSheetProtectionAtom, {
    sheetId: 'orders', state: { mode: 'open', unlockedRanges: [] },
  }))
  expect(bar).not.toHaveAttribute('readonly')
  expect(screen.getByRole('tab', { name: 'Sales Orders' })).not.toHaveAttribute('data-read-only')
  fireEvent.doubleClick(cell)
  expect(screen.getByLabelText('Cell editor')).toBeVisible()
})
