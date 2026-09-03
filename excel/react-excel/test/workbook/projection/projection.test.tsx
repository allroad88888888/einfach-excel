import { createStore, type Store } from '@einfach/core'
import {
  editingSessionAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  viewportMetricsAtom,
  visibleWindowAtom,
  type RustWorkbookConnection,
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
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

function createProjectionConnection() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
    requests.push(request)
    return resultFor(request)
  })
  return {
    connection: createTestRustWorkbookConnection({ readVisibleProjection }),
    readVisibleProjection,
    requests,
  }
}

function renderWorksheet(connection: RustWorkbookConnection): Store {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
  })
  render(
    <WorkbookRuntimeProvider connection={connection} store={store}>
      <Workbook />
    </WorkbookRuntimeProvider>,
  )
  return store
}

function dispatchPointer(target: HTMLElement, type: 'pointerdown' | 'pointerup'): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
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
    const controlled = createProjectionConnection()
    const store = renderWorksheet(controlled.connection)
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
    expect(screen.getByLabelText('Active cell value')).toHaveValue('Order')
  })

  it('reaches the last record while preserving absolute selection coordinates', async () => {
    const controlled = createProjectionConnection()
    const store = renderWorksheet(controlled.connection)
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
    act(() => dispatchPointer(lastFormulaCell, 'pointerdown'))

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 1_000,
      rowEnd: 1_000,
      colStart: 6,
      colEnd: 6,
    })
    expect(screen.getByRole('textbox', { name: 'Name box' })).toHaveValue('G1001')
    expect(screen.getByLabelText('Active cell value')).toHaveValue('=E1001*F1001')
    expect(document.querySelectorAll('td')).toHaveLength(
      GRID_WINDOW_ROW_COUNT * SALES_ORDER_COLUMNS.length,
    )
  })

  it('retains one complete projection frame during a one-row scroll', async () => {
    const nextProjection = deferred<VisibleProjectionResult>()
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return requests.length === 1 ? resultFor(request) : nextProjection.promise
    })
    renderWorksheet(createTestRustWorkbookConnection({ readVisibleProjection }))
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 1_200 },
      scrollHeight: {
        configurable: true,
        value: (SALES_ORDER_SHEET_ROW_COUNT + 1) * GRID_ROW_HEIGHT,
      },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests).toHaveLength(2))

    expect(screen.queryByText('Loading visible cells…')).not.toBeInTheDocument()
    expect(document.querySelectorAll('td')).toHaveLength(
      GRID_WINDOW_ROW_COUNT * SALES_ORDER_COLUMNS.length,
    )
    expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('Order')
    expect(document.querySelector('[data-cell="31:0"]')).toHaveTextContent('SO-10031')
    expect(document.querySelector('[data-cell="32:0"]')).toBeNull()

    act(() => nextProjection.resolve(resultFor(requests[1]!)))
    await waitFor(() => {
      expect(document.querySelector('[data-cell="32:0"]')).toHaveTextContent('SO-10032')
    })
  })

  it('places a distant retained frame in view without exposing stale interactions', async () => {
    const nextProjection = deferred<VisibleProjectionResult>()
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return requests.length === 1 ? resultFor(request) : nextProjection.promise
    })
    const store = renderWorksheet(createTestRustWorkbookConnection({ readVisibleProjection }))
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 1_200 },
      scrollHeight: {
        configurable: true,
        value: (SALES_ORDER_SHEET_ROW_COUNT + 1) * GRID_ROW_HEIGHT,
      },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: 400 * GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests).toHaveLength(2))

    expect(requests[1]?.window.rowStart).toBe(400)
    const grid = screen.getByLabelText('One thousand sales order records')
    const frameTop = Number.parseFloat(grid.style.getPropertyValue('--grid-window-offset'))
    const frameBottom = frameTop + GRID_WINDOW_ROW_COUNT * GRID_ROW_HEIGHT
    expect(frameTop).toBe(400 * GRID_ROW_HEIGHT)
    expect(frameTop).toBeLessThan(scroll.scrollTop + scroll.clientHeight)
    expect(frameBottom).toBeGreaterThan(scroll.scrollTop)
    expect(grid).toHaveAttribute('data-projection-retained', 'true')
    expect(grid).toHaveAttribute('tabindex', '-1')

    const retainedCell = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
    dispatchPointer(retainedCell, 'pointerdown')
    dispatchPointer(retainedCell, 'pointerup')
    fireEvent.doubleClick(retainedCell)
    grid.focus()
    fireEvent.keyDown(grid, { key: 'Enter' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    expect(store.getter(editingSessionAtom).source).toBeNull()

    expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('Order')
    expect(document.querySelector('[data-cell="400:0"]')).toBeNull()
    expect(document.querySelectorAll('td')).toHaveLength(
      GRID_WINDOW_ROW_COUNT * SALES_ORDER_COLUMNS.length,
    )

    act(() => nextProjection.resolve(resultFor(requests[1]!)))
    const readyCell = await waitFor(() => {
      const cell = document.querySelector<HTMLElement>('[data-cell="400:1"]')
      expect(cell).toHaveTextContent('R400C1')
      return cell!
    })
    expect(grid).toHaveAttribute('data-projection-retained', 'false')
    expect(grid).toHaveAttribute('tabindex', '0')
    expect(grid.style.getPropertyValue('--grid-window-offset')).toBe(
      `${400 * GRID_ROW_HEIGHT}px`,
    )

    dispatchPointer(readyCell, 'pointerdown')
    dispatchPointer(readyCell, 'pointerup')
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 400, col: 1 })
    fireEvent.doubleClick(readyCell)
    expect(store.getter(editingSessionAtom).source).toMatchObject({
      sheetId: 'orders',
      cell: { row: 400, col: 1 },
    })
  })

  it('shows Rust projection failures in place of worksheet cells', async () => {
    const readVisibleProjection = jest.fn(async () => {
      throw new Error('Rust projection unavailable')
    })
    renderWorksheet(createTestRustWorkbookConnection({ readVisibleProjection }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Rust projection unavailable')
    expect(document.querySelectorAll('td')).toHaveLength(0)
  })
})
