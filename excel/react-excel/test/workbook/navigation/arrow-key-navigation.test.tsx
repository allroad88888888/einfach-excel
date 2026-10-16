import {
  selectionSnapshotAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../../../src/workbook/grid/viewport/workbook-grid-config'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('workbook arrow-key navigation', () => {
  it('moves the selection and follows it past the visible window', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(requests).toHaveLength(1))
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()

    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 1 })
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })

    // 检查连续导航的最终窗口；不为每个同步按键重绘整块虚拟网格。
    act(() => {
      for (let row = 0; row < 32; row += 1) {
        fireEvent.keyDown(grid, { key: 'ArrowDown' })
      }
    })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 32, col: 0 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(WORKBOOK_GRID_ROW_HEIGHT)
    expect(requests).toHaveLength(1)
    await waitFor(() => expect(document.querySelector('[data-cell="32:0"]')).toBeInTheDocument())
    expect(grid).toHaveFocus()
  })

  it('extends and contracts the rendered selection while Shift is held', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(requests).toHaveLength(1))
    const grid = screen.getByLabelText('Sales Orders cells')

    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true })

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 0,
      colStart: 0,
      colEnd: 1,
    })
    expect(document.querySelector('[data-cell="0:0"]')).toHaveAttribute('data-selected', 'true')
    expect(document.querySelector('[data-cell="0:1"]')).toHaveAttribute('data-selected', 'true')

    fireEvent.keyDown(grid, { key: 'ArrowLeft', shiftKey: true })

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 0,
      colStart: 0,
      colEnd: 0,
    })
    expect(document.querySelector('[data-cell="0:1"]')).not.toHaveAttribute('data-selected')
  })
})
