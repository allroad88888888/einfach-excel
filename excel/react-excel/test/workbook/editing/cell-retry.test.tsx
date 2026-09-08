import { editingCommitLifecycleAtom, editingSessionAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('Rust workbook cell retry', () => {
  it('shows formula-bar rejection without mounting the cell editor and clears it on cancellation', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.failNextMutation('INVALID_FORMULA')
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const formula = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => formula.focus())
    fireEvent.input(formula, { target: { value: '=SUM(' } })
    fireEvent.keyDown(formula, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('That edit was not saved.')
    expect(formula).toHaveAttribute('aria-invalid', 'true')
    expect(formula).toHaveAccessibleDescription('That edit was not saved.')
    expect(formula).toHaveValue('=SUM(')
    expect(screen.queryByRole('textbox', { name: 'Cell editor' })).not.toBeInTheDocument()
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(formula, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(formula).not.toHaveAttribute('aria-invalid')
  })

  it('keeps a rejected mutation draft editable for an explicit retry', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.failNextMutation('Rust write rejected')
    const store = renderSalesOrdersEditingWorksheet(controlled)
    fireEvent.doubleClick(await firstEditingCell())
    const editor = await focusedCellEditor()
    fireEvent.change(editor, { target: { value: 'Retry me' } })
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => expect(store.getter(editingCommitLifecycleAtom).status).toBe('rejected'))
    expect(screen.getByRole('alert')).toHaveTextContent('That edit was not saved.')
    expect(screen.getByRole('textbox', { name: 'Cell editor' })).toHaveValue('Retry me')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Cell editor' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cell editor' }), {
      target: { value: 'Retry changed' },
    })
    expect(store.getter(editingSessionAtom).draft).toBe('Retry changed')
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })
})
