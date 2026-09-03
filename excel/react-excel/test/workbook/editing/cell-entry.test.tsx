import { createStore } from '@einfach/core'
import { setSelectionAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createControlledCellEditingConnection,
  dispatchEditingPointer,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('Rust workbook cell entry', () => {
  it('opens the captured pointer cell from a complete browser double-click sequence', async () => {
    const controlled = createControlledCellEditingConnection()
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const grid = screen.getByLabelText('Sales Orders cells')
    const cell = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
    const elementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => cell),
    })

    try {
      dispatchEditingPointer(cell, 'pointerdown', 31)
      dispatchEditingPointer(grid, 'pointerup', 31)
      fireEvent.click(grid, { clientX: 180, clientY: 72, detail: 1 })
      expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
      dispatchEditingPointer(cell, 'pointerdown', 32)
      dispatchEditingPointer(grid, 'pointerup', 32)
      fireEvent.click(grid, { clientX: 180, clientY: 72, detail: 2 })
      fireEvent.doubleClick(grid, { clientX: 180, clientY: 72, detail: 2 })

      const editor = await focusedCellEditor()
      expect(editor).toHaveValue('R1C1')
      expect(editor).toHaveAttribute('id', 'cell-editor-r1-c1')
      expect(editor).toHaveAttribute('name', 'cell-editor-r1-c1')
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: elementFromPoint,
      })
    }
  })

  it('uses the range focus cell for keyboard editing and mutation', async () => {
    const controlled = createControlledCellEditingConnection()
    const store = createStore()
    renderSalesOrdersEditingWorksheet(controlled, store)
    await firstEditingCell()
    act(() => {
      store.setter(setSelectionAtom, {
        kind: 'range',
        sheetId: 'orders',
        anchor: { row: 0, col: 0 },
        focus: { row: 1, col: 1 },
      })
    })
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    const editor = await focusedCellEditor()
    expect(editor).toHaveValue('R1C1')
    fireEvent.change(editor, { target: { value: 'Focus edit' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ row: 1, col: 1, input: 'Focus edit' }),
    )
  })
})
