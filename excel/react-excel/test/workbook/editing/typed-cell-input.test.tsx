import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('typed cell input dispatch', () => {
  for (const source of ['cell', 'formula'] as const) {
    test.each(["'00123", ' FaLsE ', '12.50%'])(
      `${source} sends %j without JS coercion`,
      async (value) => {
        const controlled = createControlledCellEditingConnection()
        renderSalesOrdersEditingWorksheet(controlled)
        const cell = await firstEditingCell()
        if (source === 'cell') fireEvent.doubleClick(cell)
        const input =
          source === 'cell'
            ? await focusedCellEditor()
            : screen.getByRole('textbox', { name: 'Active cell value' })
        act(() => input.focus())
        fireEvent.input(input, { target: { value } })
        fireEvent.change(input, { target: { value } })
        fireEvent.keyDown(input, { key: 'Enter' })
        await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
        expect(controlled.setCellInput).toHaveBeenCalledWith(
          expect.objectContaining({ input: value }),
        )
        expect(controlled.commands.filter((command) => command === 'cell.setInput')).toHaveLength(1)
      },
    )
  }

  test('reopening literal numeric text keeps the Rust escape marker in both editors', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.readVisibleProjection.mockImplementation(async (request) => ({
      ...request,
      cells: [{ row: 0, col: 0, displayValue: '00123', inputText: "'00123", valueKind: 'string' }],
    }))
    renderSalesOrdersEditingWorksheet(controlled)
    const cell = await firstEditingCell()
    expect(cell).toHaveTextContent('00123')
    expect(screen.getByRole('textbox', { name: 'Active cell value' })).toHaveValue("'00123")
    fireEvent.doubleClick(cell)
    const editor = await focusedCellEditor()
    expect(editor).toHaveValue("'00123")
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() =>
      expect(controlled.setCellInput).toHaveBeenCalledWith(
        expect.objectContaining({ input: "'00123" }),
      ),
    )
  })
})
