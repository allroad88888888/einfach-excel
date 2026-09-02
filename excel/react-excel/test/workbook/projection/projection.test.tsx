import { createStore, type Store } from '@einfach/core'
import {
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  viewportMetricsAtom,
  visibleWindowAtom,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../src/product/sales-orders/data/sheet'
import {
  GRID_ROW_HEIGHT,
  GRID_WINDOW_ROW_COUNT,
} from '../../../src/workbook/projection/use-grid-window'
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'

const { Workbook } = jest.requireActual('../../../src/workbook/shell/Workbook') as {
  Workbook: ComponentType
}

function valueAt(row: number, col: number): string {
  if (row === 0) return SALES_ORDER_COLUMNS[col]?.label ?? ''
  return col === 0 ? `SO-${String(10_000 + row)}` : `R${row}C${col}`
}

function resultFor(request: VisibleProjectionRequest): VisibleProjectionResult {
  const cells = []
  for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
    for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
      cells.push({
        row,
        col,
        displayValue: valueAt(row, col),
        formula: row > 0 && col === 6 ? `=E${row + 1}*F${row + 1}` : undefined,
      })
    }
  }
  return {
    kind: 'visible-window',
    requestId: request.requestId,
    sheetId: request.sheetId,
    window: request.window,
    cells,
  }
}

function createProjectionBackend() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
    requests.push(request)
    return resultFor(request)
  })
  return {
    backend: { readVisibleProjection } as unknown as SpreadsheetBackend,
    readVisibleProjection,
    requests,
  }
}

function renderWorksheet(backend: SpreadsheetBackend): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
  })
  render(
    <WorkbookRuntimeProvider backend={backend} store={store}>
      <Workbook />
    </WorkbookRuntimeProvider>,
  )
  return store
}

function pointerDown(target: HTMLElement): void {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: 1 },
    clientY: { value: 1 },
    isPrimary: { value: true },
    pointerId: { value: 11 },
  })
  fireEvent(target, event)
}

describe('Rust workbook projection window', () => {
  it('requests a bounded orders window and only mounts that projection', async () => {
    const controlled = createProjectionBackend()
    const store = renderWorksheet(controlled.backend)
    const projectedCellCount = GRID_WINDOW_ROW_COUNT * SALES_ORDER_COLUMNS.length

    await waitFor(() => expect(controlled.requests).toHaveLength(1))
    expect(controlled.requests[0]).toMatchObject({
      sheetId: 'orders',
      window: {
        rowStart: 0,
        rowEnd: GRID_WINDOW_ROW_COUNT - 1,
        colStart: 0,
        colEnd: SALES_ORDER_COLUMNS.length - 1,
      },
    })
    expect(store.getter(visibleWindowAtom)).toEqual(controlled.requests[0]?.window)
    await waitFor(() => expect(document.querySelectorAll('td')).toHaveLength(projectedCellCount))
    expect(document.querySelectorAll('td').length).toBeLessThan(8_008)
    expect(screen.getByText('Rust/WASM ready')).toBeInTheDocument()
    expect(screen.getByLabelText('Active cell value')).toHaveTextContent('Order')
  })

  it('reaches the last record while preserving absolute selection coordinates', async () => {
    const controlled = createProjectionBackend()
    const store = renderWorksheet(controlled.backend)
    await waitFor(() => expect(controlled.requests).toHaveLength(1))
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    const scrollHeight = (SALES_ORDER_SHEET_ROW_COUNT + 1) * GRID_ROW_HEIGHT
    const clientHeight = 1_200
    const maxScrollTop = scrollHeight - clientHeight
    expect(clientHeight).toBeGreaterThan(924)
    expect(Math.floor(maxScrollTop / GRID_ROW_HEIGHT)).toBeLessThan(
      SALES_ORDER_SHEET_ROW_COUNT - GRID_WINDOW_ROW_COUNT,
    )
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: clientHeight },
      scrollHeight: { configurable: true, value: scrollHeight },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: maxScrollTop } })
    expect(scroll.scrollTop).toBe(maxScrollTop)
    await waitFor(() => expect(controlled.requests).toHaveLength(2))
    expect(controlled.requests[1]?.window).toEqual({
      rowStart: SALES_ORDER_SHEET_ROW_COUNT - GRID_WINDOW_ROW_COUNT,
      rowEnd: 1_000,
      colStart: 0,
      colEnd: 7,
    })
    expect(store.getter(visibleWindowAtom)).toEqual(controlled.requests[1]?.window)
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(
      (SALES_ORDER_SHEET_ROW_COUNT - GRID_WINDOW_ROW_COUNT) * GRID_ROW_HEIGHT,
    )

    const lastFormulaCell = await waitFor(() => {
      const cell = document.querySelector('[data-cell="1000:6"]')
      expect(cell).not.toBeNull()
      return cell as HTMLElement
    })
    act(() => pointerDown(lastFormulaCell))

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 1_000,
      rowEnd: 1_000,
      colStart: 6,
      colEnd: 6,
    })
    expect(screen.getByLabelText('Selected range')).toHaveTextContent('G1001')
    expect(screen.getByLabelText('Active cell value')).toHaveTextContent('=E1001*F1001')
    expect(document.querySelectorAll('td')).toHaveLength(
      GRID_WINDOW_ROW_COUNT * SALES_ORDER_COLUMNS.length,
    )
  })

  it('shows Rust projection failures in place of worksheet cells', async () => {
    const readVisibleProjection = jest.fn(async () => {
      throw new Error('Rust projection unavailable')
    })
    renderWorksheet({ readVisibleProjection } as unknown as SpreadsheetBackend)

    expect(await screen.findByRole('alert')).toHaveTextContent('Rust projection unavailable')
    expect(document.querySelectorAll('td')).toHaveLength(0)
  })
})
