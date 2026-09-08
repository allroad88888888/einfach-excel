import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { editingSessionAtom } from '@einfach/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('editing input semantics', () => {
  test('the formula bar and cell editor use original input rather than formatted display', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.readVisibleProjection.mockImplementation(async (request) => ({
      ...request,
      cells: [{ row: 0, col: 0, displayValue: '$125', inputText: '125.02' }],
    }))
    renderSalesOrdersEditingWorksheet(controlled)
    const cell = await firstEditingCell()
    expect(cell).toHaveTextContent('$125')
    expect(screen.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('125.02')
    fireEvent.doubleClick(cell)
    expect(await focusedCellEditor()).toHaveValue('125.02')
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    await waitFor(() =>
      expect(controlled.setCellInput).toHaveBeenCalledWith(
        expect.objectContaining({ input: '125.02' }),
      ),
    )
  })

  test.each(['cell', 'formula'] as const)(
    '%s input leaves IME confirmation and Alt+Enter to the browser',
    async (source) => {
      const controlled = createControlledCellEditingConnection()
      const store = renderSalesOrdersEditingWorksheet(controlled)
      const cell = await firstEditingCell()
      if (source === 'cell') fireEvent.doubleClick(cell)
      const input =
        source === 'cell'
          ? await focusedCellEditor()
          : screen.getByRole('textbox', { name: 'Active cell value' })
      act(() => input.focus())
      expect(input.tagName).toBe('TEXTAREA')
      fireEvent.input(input, { target: { value: '中文' } })
      for (const key of [
        { key: 'Enter', isComposing: true },
        { key: 'Escape', isComposing: true },
        { key: 'Enter', keyCode: 229 },
      ])
        expect(fireEvent.keyDown(input, key)).toBe(true)
      expect(controlled.setCellInput).not.toHaveBeenCalled()
      expect(store.getter(editingSessionAtom).source).not.toBeNull()
      expect(fireEvent.keyDown(input, { key: 'Enter', altKey: true })).toBe(false)
      expect(controlled.setCellInput).not.toHaveBeenCalled()
      // jsdom 不实现 textarea 默认换行；真实 Alt+Enter 由持久化 E2E 验证。
      fireEvent.input(input, { target: { value: '中文\n第二行' } })
      fireEvent.change(input, { target: { value: '中文\n第二行' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() =>
        expect(controlled.setCellInput).toHaveBeenCalledWith(
          expect.objectContaining({ input: '中文\n第二行' }),
        ),
      )
    },
  )
})
