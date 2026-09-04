import { selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('cell editor Tab navigation', () => {
  it('commits through Rust before moving right or left', async () => {
    const controlled = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(controlled)
    const grid = screen.getByLabelText('Sales Orders cells')
    fireEvent.doubleClick(await firstEditingCell())
    const firstEditor = await focusedCellEditor()
    fireEvent.change(firstEditor, { target: { value: 'Tabbed edit' } })

    fireEvent.keyDown(firstEditor, { key: 'Tab' })

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(store.getter(selectionSnapshotAtom).activeCell.col).toBe(1))
    expect(document.activeElement).toBe(grid)

    const rightCell = document.querySelector<HTMLElement>('[data-cell="0:1"]')!
    fireEvent.doubleClick(rightCell)
    const secondEditor = await focusedCellEditor()
    fireEvent.keyDown(secondEditor, { key: 'Tab', shiftKey: true })

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(store.getter(selectionSnapshotAtom).activeCell.col).toBe(0))
    expect(document.activeElement).toBe(grid)
  })
})
