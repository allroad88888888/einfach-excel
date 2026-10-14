import { editingCommitLifecycleAtom, editingSessionAtom } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('formula-bar keyboard focus', () => {
  it('returns to grid navigation after one Enter commit', async () => {
    const controlled = createControlledCellEditingConnection()
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const bar = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => bar.focus())
    fireEvent.input(bar, { target: { value: 'Saved value' } })
    fireEvent.keyDown(bar, { key: 'Enter' })
    const grid = screen.getByLabelText('Sales Orders cells')
    await waitFor(() => expect(grid).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2')
    expect(await firstEditingCell()).toHaveTextContent('Saved value')
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(1)
  })

  it('cancels without a write or a new blocked lifecycle on blur', async () => {
    const controlled = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(controlled)
    const original = (await firstEditingCell()).textContent
    const bar = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => bar.focus())
    fireEvent.input(bar, { target: { value: 'Discarded' } })
    fireEvent.keyDown(bar, { key: 'Escape' })
    expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
    expect(store.getter(editingSessionAtom).source).toBeNull()
    expect(store.getter(editingCommitLifecycleAtom).status).toBe('ready')
    expect(await firstEditingCell()).toHaveTextContent(original!)
    expect(controlled.setCellInput).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    })
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('B1')
  })

  it('keeps rejection feedback and restores the formula input for correction', async () => {
    const controlled = createControlledCellEditingConnection()
    controlled.failNextMutation('INVALID_FORMULA')
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const bar = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => bar.focus())
    fireEvent.input(bar, { target: { value: '=SUM(' } })
    fireEvent.keyDown(bar, { key: 'Enter' })
    // jsdom 不模拟 disabled 控件失焦，显式还原真实浏览器交给 body 的状态。
    act(() => bar.blur())
    expect(await screen.findByRole('alert')).toHaveTextContent('That edit was not saved.')
    await waitFor(() => expect(bar).toHaveFocus())
    expect(bar).toHaveValue('=SUM(')
    expect(bar).toHaveAttribute('aria-invalid', 'true')
    fireEvent.input(document.activeElement!, { target: { value: 'Corrected' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    await waitFor(() => expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus())
    expect(await firstEditingCell()).toHaveTextContent('Corrected')
    expect(controlled.setCellInput.mock.calls.map(([request]) => request.input))
      .toEqual(['=SUM(', 'Corrected'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not steal focus from a name-box draft while a commit is pending', async () => {
    const controlled = createControlledCellEditingConnection()
    const write = controlled.setCellInput.getMockImplementation()!
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    controlled.setCellInput.mockImplementationOnce(async (request) => {
      await gate
      return write(request)
    })
    renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const bar = screen.getByRole('textbox', { name: 'Active cell value' })
    act(() => bar.focus())
    fireEvent.input(bar, { target: { value: 'Pending value' } })
    fireEvent.keyDown(bar, { key: 'Enter' })
    await waitFor(() => expect(bar).toBeDisabled())
    const name = screen.getByRole('textbox', { name: 'Name box' })
    act(() => name.focus())
    fireEvent.input(name, { target: { value: 'A20' } })
    await act(async () => { release(); await gate })
    await waitFor(() => expect(bar).toBeEnabled())
    expect(name).toHaveFocus()
    expect(name).toHaveValue('A20')
    expect(controlled.setCellInput).toHaveBeenCalledTimes(1)
  })

  it('returns focus only to the formula bar’s own workbook', async () => {
    const first = createControlledCellEditingConnection()
    const second = createControlledCellEditingConnection()
    renderSalesOrdersEditingWorksheet(first)
    renderSalesOrdersEditingWorksheet(second)
    const bars = screen.getAllByRole('textbox', { name: 'Active cell value' })
    await waitFor(() => expect(bars[1]).toBeEnabled())
    const grids = screen.getAllByLabelText('Sales Orders cells')
    act(() => bars[1]!.focus())
    fireEvent.input(bars[1]!, { target: { value: 'Second workbook' } })
    fireEvent.keyDown(bars[1]!, { key: 'Enter' })
    await waitFor(() => expect(grids[1]).toHaveFocus())
    expect(grids[0]).not.toHaveFocus()
    expect(first.setCellInput).not.toHaveBeenCalled()
    expect(second.setCellInput).toHaveBeenCalledTimes(1)
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    })
    const names = screen.getAllByRole('textbox', { name: 'Name box' })
    expect(names[0]).toHaveValue('A1')
    expect(names[1]).toHaveValue('A2')
  })
})
