import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderFormattingRibbon } from '../../support/formatting-ribbon-harness'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('ribbon clear actions', () => {
  test('sends all three modes and refreshes the formatting buttons', async () => {
    const { clears } = await renderFormattingRibbon()
    const bold = screen.getByRole('button', { name: 'Bold' })
    fireEvent.click(bold)
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear contents' }))
    await waitFor(() => expect(clears).toHaveLength(1))
    expect(bold).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }))
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'false'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(clears).toHaveLength(3))
    expect(clears.map((request) => request.mode)).toEqual(['contents', 'formats', 'all'])
  })

  test('disables clear actions while a cell draft is open', async () => {
    renderSalesOrdersEditingWorksheet(createControlledCellEditingConnection())
    fireEvent.doubleClick(await firstEditingCell())
    await focusedCellEditor()
    for (const name of ['Clear contents', 'Clear formatting', 'Clear all']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
})
