import {
  selectionSnapshotAtom,
  visibleWindowAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it } from '@jest/globals'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../src/page/demo/sales-orders/data/sheet'
import {
  WORKBOOK_GRID_ROW_HEIGHT,
  WORKBOOK_GRID_WINDOW_COLUMN_COUNT,
  WORKBOOK_GRID_WINDOW_ROW_COUNT,
} from '../../../src/workbook/grid/viewport/workbook-grid-config'
import {
  createProjectionConnection,
  dispatchProjectionPointer,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('Rust workbook projection window', () => {
  it('requests a bounded orders window and only mounts that projection', async () => {
    const controlled = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(controlled.connection)
    const projectedCellCount =
      WORKBOOK_GRID_WINDOW_ROW_COUNT * WORKBOOK_GRID_WINDOW_COLUMN_COUNT

    await waitFor(() => expect(controlled.requests).toHaveLength(1))
    expect(controlled.requests[0]).toMatchObject({
      sheetId: 'orders',
      window: {
        rowStart: 0,
        rowEnd: WORKBOOK_GRID_WINDOW_ROW_COUNT - 1,
        colStart: 0,
        colEnd: WORKBOOK_GRID_WINDOW_COLUMN_COUNT - 1,
      },
    })
    expect(store.getter(visibleWindowAtom)).toEqual(controlled.requests[0]?.window)
    await waitFor(() => expect(document.querySelectorAll('td')).toHaveLength(projectedCellCount))
    expect(document.querySelectorAll('td').length).toBeLessThan(
      SALES_ORDER_SHEET_ROW_COUNT * SALES_ORDER_COLUMNS.length,
    )
    expect(screen.getByText('Rust/WASM ready')).toBeInTheDocument()
    expect(screen.getByLabelText('Active cell value')).toHaveValue('Order')
  })

  it('reaches the last record while preserving absolute selection coordinates', async () => {
    const controlled = createProjectionConnection()
    const store = renderSalesOrdersProjectionWorksheet(controlled.connection)
    await waitFor(() => expect(controlled.requests).toHaveLength(1))
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    const scrollHeight = (SALES_ORDER_SHEET_ROW_COUNT + 1) * WORKBOOK_GRID_ROW_HEIGHT
    const clientHeight = 1_200
    const visibleRowCount = Math.ceil(
      (clientHeight - WORKBOOK_GRID_ROW_HEIGHT) / WORKBOOK_GRID_ROW_HEIGHT,
    )
    const bottomScrollTop =
      (SALES_ORDER_SHEET_ROW_COUNT - visibleRowCount) * WORKBOOK_GRID_ROW_HEIGHT
    const maxScrollTop = scrollHeight - clientHeight
    expect(clientHeight).toBeGreaterThan(924)
    expect(Math.floor(maxScrollTop / WORKBOOK_GRID_ROW_HEIGHT)).toBeLessThan(
      SALES_ORDER_SHEET_ROW_COUNT - WORKBOOK_GRID_WINDOW_ROW_COUNT,
    )
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: clientHeight },
      scrollHeight: { configurable: true, value: scrollHeight },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: maxScrollTop } })
    expect(scroll.scrollTop).toBe(bottomScrollTop)
    await waitFor(() => expect(controlled.requests).toHaveLength(2))
    expect(controlled.requests[1]?.window).toEqual({
      rowStart: SALES_ORDER_SHEET_ROW_COUNT - visibleRowCount,
      rowEnd: SALES_ORDER_SHEET_ROW_COUNT - 1,
      colStart: 0,
      colEnd: WORKBOOK_GRID_WINDOW_COLUMN_COUNT - 1,
    })
    expect(store.getter(visibleWindowAtom)).toEqual(controlled.requests[1]?.window)
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(bottomScrollTop)

    const lastDataRow = SALES_ORDER_SHEET_ROW_COUNT - 1
    const formulaColumn = SALES_ORDER_COLUMNS.findIndex(({ key }) => key === 'total')
    const lastFormulaCell = await waitFor(() => {
      const cell = document.querySelector(`[data-cell="${lastDataRow}:${formulaColumn}"]`)
      expect(cell).not.toBeNull()
      return cell as HTMLElement
    })
    act(() => dispatchProjectionPointer(lastFormulaCell, 'pointerdown'))

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: lastDataRow,
      rowEnd: lastDataRow,
      colStart: formulaColumn,
      colEnd: formulaColumn,
    })
    const lastSheetRow = lastDataRow + 1
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue(
      `${String.fromCharCode(65 + formulaColumn)}${lastSheetRow}`,
    )
    expect(screen.getByLabelText('Active cell value')).toHaveValue(
      `=E${lastSheetRow}*F${lastSheetRow}`,
    )
    expect(document.querySelectorAll('td')).toHaveLength(
      visibleRowCount * WORKBOOK_GRID_WINDOW_COLUMN_COUNT,
    )
  })
})
