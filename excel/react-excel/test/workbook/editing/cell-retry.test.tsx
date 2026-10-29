import {
  editingCommitLifecycleAtom, editingSessionAtom, selectionSnapshotAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  createControlledCellEditingConnection,
  dispatchEditingPointer,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('Rust workbook cell retry', () => {
  it.each(['cell', 'formula-bar'])(
    '%s rejected blur cannot be replaced by a different projected cell', async (source) => {
      const controlled = createControlledCellEditingConnection()
      controlled.failNextMutation('DATA_VALIDATION_FAILED')
      const store = renderSalesOrdersEditingWorksheet(controlled)
      const first = await firstEditingCell()
      if (source === 'cell') fireEvent.doubleClick(first)
      const input = screen.getByRole('textbox', {
        name: source === 'cell' ? 'Cell editor' : 'Active cell value',
      })
      act(() => input.focus())
      if (source === 'cell') fireEvent.change(input, { target: { value: 'Rejected draft' } })
      else fireEvent.input(input, { target: { value: 'Rejected draft' } })
      const next = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
      await act(async () => {
        screen.getByLabelText('Sales Orders cells').focus()
        dispatchEditingPointer(next, 'pointerdown', 8)
        dispatchEditingPointer(next, 'pointerup', 8)
      })
      expect(await screen.findByRole('alert')).toHaveTextContent('data validation rule')
      fireEvent.doubleClick(next)
      expect(input).toHaveValue('Rejected draft')
      expect(input).toHaveFocus()
      expect(store.getter(editingSessionAtom)).toMatchObject({
        source: { cell: { row: 0, col: 0 }, source }, draft: 'Rejected draft',
      })
      expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
      expect(screen.getByRole('alert')).toHaveTextContent('data validation rule')
      expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
      if (source === 'cell') fireEvent.change(input, { target: { value: 'Corrected draft' } })
      else fireEvent.input(input, { target: { value: 'Corrected draft' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(first).toHaveTextContent('Corrected draft'))
      expect(next).toHaveTextContent('R1C1')
      expect(controlled.setCellInput.mock.calls.map(([request]) =>
        [request.row, request.col, request.input])).toEqual([
        [0, 0, 'Rejected draft'], [0, 0, 'Corrected draft'],
      ])
    },
  )

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
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    expect(await firstEditingCell()).toHaveTextContent('Retry changed')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const next = document.querySelector<HTMLElement>('[data-cell="1:0"]')!
    fireEvent.doubleClick(next)
    const nextEditor = await focusedCellEditor()
    fireEvent.change(nextEditor, { target: { value: 'Next cell' } })
    fireEvent.keyDown(nextEditor, { key: 'Enter' })
    await waitFor(() => expect(next).toHaveTextContent('Next cell'))
    expect(controlled.setCellInput.mock.calls.map(([request]) =>
      [request.row, request.col, request.input])).toEqual([
      [0, 0, 'Retry me'], [0, 0, 'Retry changed'], [1, 0, 'Next cell'],
    ])
    expect(new Set(controlled.setCellInput.mock.calls.map(([request]) => request.requestId)).size)
      .toBe(3)
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })

  it('formula-bar rejection can be corrected and committed without duplicate blur writes', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.failNextMutation('INVALID_FORMULA')
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const formula = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => formula.focus())
    fireEvent.input(formula, { target: { value: '=SUM(' } })
    fireEvent.keyDown(formula, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('That edit was not saved.')
    fireEvent.input(formula, { target: { value: 'Corrected value' } })
    fireEvent.keyDown(formula, { key: 'Enter' })
    fireEvent.blur(formula)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(await firstEditingCell()).toHaveTextContent('Corrected value')
    expect(formula).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('textbox', { name: 'Cell editor' })).not.toBeInTheDocument()
    expect(controlled.setCellInput.mock.calls.map(([request]) => request.input))
      .toEqual(['=SUM(', 'Corrected value'])
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })
})
