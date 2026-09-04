import {
  selectionSnapshotAtom,
  setViewportSizeAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { SALES_ORDER_SHEET_ROW_COUNT } from '../../../src/page/demo/sales-orders/data/sheet'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../../../src/workbook/grid/viewport/workbook-grid-config'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('workbook boundary-key navigation', () => {
  it('moves to row and sheet boundaries while keeping the projection current', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(requests).toHaveLength(1))
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()

    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'End' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 1000, col: 1 })
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.window.rowEnd).toBe(1000)
    await waitFor(() => expect(document.querySelector('[data-cell="1000:1"]')).toBeInTheDocument())

    fireEvent.keyDown(grid, { key: 'Home' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 1000, col: 0 })

    fireEvent.keyDown(grid, { key: 'Home', ctrlKey: true })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(0)
    await waitFor(() => expect(requests).toHaveLength(3))

    fireEvent.keyDown(grid, { key: 'ArrowDown', metaKey: true })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 1000, col: 0 })
    await waitFor(() => expect(requests).toHaveLength(4))
  })

  it('exposes the complete last row and still allows manual scrolling away', async () => {
    const { connection } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toBeInTheDocument())
    const grid = screen.getByLabelText('Sales Orders cells')
    const scroll = screen.getByTestId('sheet-scroll')
    const clientHeight = 697
    const scrollHeight = (SALES_ORDER_SHEET_ROW_COUNT + 1) * WORKBOOK_GRID_ROW_HEIGHT
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: clientHeight },
      scrollHeight: { configurable: true, value: scrollHeight },
    })
    act(() => {
      store.setter(setViewportSizeAtom, {
        viewportHeight: clientHeight - WORKBOOK_GRID_ROW_HEIGHT,
        viewportWidth: store.getter(viewportMetricsAtom).viewportWidth,
      })
    })
    grid.focus()

    fireEvent.keyDown(grid, { key: 'ArrowDown', metaKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(1000)
    await waitFor(() => expect(document.querySelector('[data-cell="1000:0"]')).toBeInTheDocument())
    await waitFor(() => expect(scroll.scrollTop).toBe(scrollHeight - clientHeight))

    fireEvent.scroll(scroll, { target: { scrollTop: 100 } })

    expect(scroll.scrollTop).toBe(100)
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(100)
    await waitFor(() => expect(document.querySelector('[data-cell="3:0"]')).toBeInTheDocument())
  })
})
