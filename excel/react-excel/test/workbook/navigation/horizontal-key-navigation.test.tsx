import { selectionSnapshotAtom, viewportMetricsAtom } from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { SALES_ORDER_COLUMNS } from '../../../src/page/demo/sales-orders/data/sheet'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
} from '../../../src/workbook/grid/viewport/workbook-grid-config'
import {
  createProjectionConnection,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('workbook horizontal boundary navigation', () => {
  it('moves the last and first columns fully into view', async () => {
    const { connection, requests } = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(connection)
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toBeInTheDocument())
    const grid = screen.getByLabelText('Sales Orders cells')
    const scroll = screen.getByTestId('sheet-scroll')
    const clientWidth = WORKBOOK_GRID_ROW_HEADER_WIDTH + 8 * WORKBOOK_GRID_COLUMN_WIDTH
    const scrollWidth =
      WORKBOOK_GRID_ROW_HEADER_WIDTH + SALES_ORDER_COLUMNS.length * WORKBOOK_GRID_COLUMN_WIDTH
    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: clientWidth },
      scrollWidth: { configurable: true, value: scrollWidth },
    })
    grid.focus()

    fireEvent.keyDown(grid, { key: 'ArrowRight', metaKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell.col).toBe(15)
    await waitFor(() => expect(document.querySelector('[data-cell="0:15"]')).toHaveTextContent('Profit'))
    await waitFor(() => expect(scroll.scrollLeft).toBe(scrollWidth - clientWidth))
    fireEvent.scroll(scroll, { target: { scrollLeft: scroll.scrollLeft } })
    expect(store.getter(viewportMetricsAtom).scrollLeft).toBe(scrollWidth - clientWidth)
    expect(
      scroll.scrollLeft +
        clientWidth -
        (WORKBOOK_GRID_ROW_HEADER_WIDTH +
          SALES_ORDER_COLUMNS.length * WORKBOOK_GRID_COLUMN_WIDTH),
    ).toBe(0)

    fireEvent.keyDown(grid, { key: 'ArrowLeft', ctrlKey: true })

    expect(store.getter(selectionSnapshotAtom).activeCell.col).toBe(0)
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('Order'))
    expect(store.getter(viewportMetricsAtom).scrollLeft).toBe(0)
    expect(scroll.scrollLeft).toBe(0)
    expect(requests.some((request) => request.window.colEnd === 15)).toBe(true)
  })
})
