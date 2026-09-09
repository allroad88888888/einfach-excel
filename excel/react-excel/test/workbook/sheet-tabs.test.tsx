import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom, rustHistoryPanelAtom, type RustWorkbookCommands,
} from '@einfach/spreadsheet-ui-core'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../support/cell-editing-harness'
import { createTestRustWorkbookConnection } from '../support/rust-workbook-connection'

async function setup() {
  const controlled = createControlledCellEditingConnection()
  const editSheet = vi.fn(async (input: RustWorkbookCommands['workbook.editSheet']['payload']) => ({
    sheet: { id: input.sheetId ?? 'new', name: input.name, index: input.sheetId ? 0 : 2 },
    revision: 1,
  }))
  const store = renderSalesOrdersEditingWorksheet({
    ...controlled,
    connection: createTestRustWorkbookConnection({
      editSheet,
      readVisibleProjection: controlled.readVisibleProjection,
      setCellInput: controlled.setCellInput,
    }),
  })
  const cell = await firstEditingCell()
  return { ...controlled, store, cell, editSheet }
}

describe('workbook sheet tabs', () => {
  test('history pending state disables tabs instead of silently ignoring a click', async () => {
    const { store } = await setup()
    act(() => store.setter(rustHistoryPanelAtom, { open: false, busy: true, error: null }))
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next sheet' })).toBeDisabled()
    act(() => store.setter(rustHistoryPanelAtom, { open: false, busy: false, error: null }))
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeEnabled()
  })

  test('adds a blank Rust sheet and switches via tabs and navigation buttons', async () => {
    const { editSheet, store } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'New sheet' }))
    const tab = await screen.findByRole('tab', { name: 'Sheet3' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(editSheet).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Sales Orders' }))
    await waitFor(() => expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders'))
    fireEvent.click(screen.getByRole('button', { name: 'Next sheet' }))
    await waitFor(() => expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary'))
  })

  test('rename uses core draft, Enter submits, Escape cancels without a second write', async () => {
    const { editSheet } = await setup()
    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Sales Orders' }))
    const input = await screen.findByRole('textbox', { name: 'Sheet name' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Budget' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByRole('tab', { name: 'Budget' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(editSheet).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'orders', name: 'Budget' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rename sheet' }))
    fireEvent.change(await screen.findByLabelText('Sheet name'), { target: { value: 'Discard' } })
    fireEvent.keyDown(screen.getByLabelText('Sheet name'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('Sheet name')).toBeNull())
    expect(editSheet).toHaveBeenCalledTimes(1)
  })

  test('Rust rejects invalid names visibly and the same draft can retry', async () => {
    const { editSheet } = await setup()
    editSheet.mockRejectedValueOnce(new Error('A worksheet with this name already exists.'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename sheet' }))
    const input = await screen.findByLabelText('Sheet name')
    fireEvent.change(input, { target: { value: 'Summary' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('tab', { name: 'Sales Orders' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.change(input, { target: { value: 'Budget' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByRole('tab', { name: 'Budget' })).toBeVisible()
  })

  test('switch commits the old sheet draft before activating the next sheet', async () => {
    const { cell, setCellInput, store } = await setup()
    fireEvent.doubleClick(cell)
    fireEvent.change(screen.getByLabelText('Cell editor'), { target: { value: 'Saved on orders' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    await waitFor(() => expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary'))
    expect(setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 'orders', input: 'Saved on orders' }),
    )
  })

  test('a failed cell commit prevents sheet switching and preserves its draft', async () => {
    const { cell, failNextMutation, store } = await setup()
    fireEvent.doubleClick(cell)
    fireEvent.change(screen.getByLabelText('Cell editor'), { target: { value: '=bad(' } })
    failNextMutation('Invalid formula')
    fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not saved'))
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
    expect(screen.getByLabelText('Cell editor')).toHaveValue('=bad(')
  })
})
