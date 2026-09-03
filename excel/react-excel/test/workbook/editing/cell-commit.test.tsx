import { editingSessionAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('Rust workbook cell commit', () => {
  it('starts, updates the draft, writes through Rust and refreshes the projection', async () => {
    const controlled = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull()

    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()
    expect(document.activeElement).toBe(grid)
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const editor = await focusedCellEditor()
    expect(editor).toHaveValue('Order')
    expect(editor).toHaveAttribute('id', 'cell-editor-r0-c0')
    expect(editor).toHaveAttribute('name', 'cell-editor-r0-c0')
    fireEvent.change(editor, { target: { value: 'Edited order' } })
    expect(store.getter(editingSessionAtom)).toMatchObject({
      status: 'drafting',
      source: { sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'cell' },
      draft: 'Edited order',
    })

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    fireEvent.blur(editor)
    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'orders', row: 0, col: 0, input: 'Edited order' }),
    )
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(await firstEditingCell()).toHaveTextContent('Edited order')
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
    expect(controlled.commands).toEqual(['projection.readVisible', 'cell.setInput'])
    await waitFor(() => expect(document.activeElement).toBe(grid))

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const keyboardEditor = await focusedCellEditor()
    expect(keyboardEditor).toHaveValue('Edited order')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
    expect(document.activeElement).toBe(grid)
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
  })

  it('commits the active draft when focus leaves the cell editor', async () => {
    const controlled = createControlledCellEditingConnection()
    renderSalesOrdersEditingWorksheet(controlled)
    fireEvent.doubleClick(await firstEditingCell())
    const editor = await focusedCellEditor()
    fireEvent.change(editor, { target: { value: 'Blurred edit' } })
    const outsideTarget = screen.getByRole('button', { name: 'Paste' })
    outsideTarget.focus()

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(await firstEditingCell()).toHaveTextContent('Blurred edit')
    expect(document.activeElement).toBe(outsideTarget)
  })
})
