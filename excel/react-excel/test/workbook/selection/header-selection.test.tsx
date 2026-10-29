import { createStore } from '@einfach/core'
import { selectionSnapshotAtom } from '@einfach-excel/spreadsheet-ui-core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { GridHeaders } from '../../../src/workbook/grid/viewport/GridHeaders'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import {
  createControlledCellEditingConnection,
  firstEditingCell,
  focusedCellEditor,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('workbook header selection', () => {
  test('keeps row DOM identity tied to its actual row when the visible window changes', () => {
    const store = createStore()
    initializeSalesOrdersStore(store)
    const headers = (rowStart: number) => (
      <WorkbookStoreProvider store={store}>
        <GridHeaders rowStart={rowStart} rowHeights={[28, 28, 28, 28, 28, 28]}
          colStart={0} columnWidths={[]} rowStyle={{}} columnStyle={{}} focusGrid={() => {}} />
      </WorkbookStoreProvider>
    )
    const view = render(headers(0))
    const row2 = screen.getByRole('button', { name: /^Select row 2$/ })
    const row5 = screen.getByRole('button', { name: /^Select row 5$/ })
    view.rerender(headers(3))
    expect(row2.isConnected).toBe(false)
    expect(row5.isConnected).toBe(true)
    expect(row5).toHaveAttribute('aria-label', 'Select row 5')
    expect(screen.getByRole('button', { name: /^Select row 5$/ })).toBe(row5)
  })

  test('renders only the column window and keeps column identity when it scrolls', () => {
    const store = createStore()
    initializeSalesOrdersStore(store)
    // 16384 列的空白工作簿也只能挂窗口内的表头，否则替换工作簿会卡住主线程数秒。
    const headers = (colStart: number) => (
      <WorkbookStoreProvider store={store}>
        <GridHeaders rowStart={0} rowHeights={[]} colStart={colStart}
          columnWidths={[100, 0, 100, 100]} rowStyle={{}} columnStyle={{}}
          focusGrid={() => {}} />
      </WorkbookStoreProvider>
    )
    const view = render(headers(2))
    const labels = () => screen.getAllByRole('columnheader').map((header) =>
      header.getAttribute('aria-label'))
    expect(labels()).toEqual(['Select column C', 'Select column E', 'Select column F'])
    const columnE = screen.getByRole('columnheader', { name: 'Select column E' })
    view.rerender(headers(4))
    expect(labels()).toEqual(['Select column E', 'Select column G', 'Select column H'])
    expect(screen.getByRole('columnheader', { name: 'Select column E' })).toBe(columnE)
  })

  test('selects rows, columns and the whole workbook with visible feedback and grid focus', async () => {
    const controlled = createControlledCellEditingConnection()
    const store = renderSalesOrdersEditingWorksheet(controlled)
    await firstEditingCell()
    const grid = screen.getByLabelText('Sales Orders cells')
    fireEvent.click(screen.getByRole('button', { name: 'Select row 3' }))
    await waitFor(() => expect(grid).toHaveFocus())
    expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('row')
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3:P3')
    expect(screen.getByRole('button', { name: 'Select row 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Selected: 16')).toBeVisible()

    fireEvent.click(screen.getByRole('columnheader', { name: 'Select column B' }))
    await waitFor(() => expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('column'))
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('B1:B1001')
    expect(screen.getByRole('columnheader', { name: 'Select column B' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Selected: 1001')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Select all cells' }))
    await waitFor(() => expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('all'))
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A1:P1001')
    expect(screen.getByText('Selected: 16016')).toBeVisible()
    expect(controlled.setCellInput).not.toHaveBeenCalled()
  })

  test('Shift click extends the existing row selection', async () => {
    const store = renderSalesOrdersEditingWorksheet(createControlledCellEditingConnection())
    await firstEditingCell()
    fireEvent.click(screen.getByRole('button', { name: 'Select row 3' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3:P3'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select row 5' }), {
      shiftKey: true,
    })
    await waitFor(() =>
      expect(store.getter(selectionSnapshotAtom).range).toEqual({
        rowStart: 2,
        rowEnd: 4,
        colStart: 0,
        colEnd: 15,
      }),
    )
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3:P5')
  })

  test.each([false, true])(
    'preserves the draft until header-click commit settles (reject=%s)',
    async (reject) => {
      const controlled = createControlledCellEditingConnection()
      const store = renderSalesOrdersEditingWorksheet(controlled)
      fireEvent.doubleClick(await firstEditingCell())
      const editor = await focusedCellEditor()
      fireEvent.change(editor, { target: { value: 'Saved before selecting' } })
      if (reject) controlled.failNextMutation('Header edit rejected')
      fireEvent.click(screen.getByRole('button', { name: 'Select row 3' }))
      await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
      if (reject) {
        await waitFor(() =>
          expect(screen.getByRole('alert')).toHaveTextContent('That edit was not saved.'),
        )
        expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('cell')
        expect(editor).toHaveValue('Saved before selecting')
      } else {
        await waitFor(() => expect(store.getter(selectionSnapshotAtom).selection.kind).toBe('row'))
        expect(await firstEditingCell()).toHaveTextContent('Saved before selecting')
        expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
        expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
      }
    },
  )
})
