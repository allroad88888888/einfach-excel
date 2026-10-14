import {
  editingSessionAtom,
  selectionSnapshotAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { SALES_ORDER_SHEET_ROW_COUNT } from '../../../src/page/demo/sales-orders/data/sheet'
import {
  WORKBOOK_GRID_ROW_HEIGHT,
} from '../../../src/workbook/grid/viewport/workbook-grid-config'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import {
  deferredProjection,
  dispatchProjectionPointer,
  projectionResultFor,
  renderSalesOrdersProjectionWorksheet,
} from '../../support/projection-harness'

describe('Rust workbook projection retention', () => {
  it('retains one complete projection frame when scrolling into the next buffer bucket', async () => {
    const nextProjection = deferredProjection<VisibleProjectionResult>()
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = vi.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return requests.length === 1 ? projectionResultFor(request) : nextProjection.promise
    })
    renderSalesOrdersProjectionWorksheet(
      createTestRustWorkbookConnection({ readVisibleProjection }),
    )
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 1_200 },
      scrollHeight: {
        configurable: true,
        value: SALES_ORDER_SHEET_ROW_COUNT * WORKBOOK_GRID_ROW_HEIGHT,
      },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: 64 * WORKBOOK_GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests).toHaveLength(2))

    expect(screen.queryByText('Loading visible cells…')).not.toBeInTheDocument()
    expect(document.querySelectorAll('td')).toHaveLength(
      (requests[0]!.window.rowEnd + 1) * (requests[0]!.window.colEnd + 1),
    )
    expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('Order')
    expect(document.querySelector('[data-cell="31:0"]')).toHaveTextContent('SO-10031')
    expect(document.querySelector(`[data-cell="${requests[0]!.window.rowEnd + 1}:0"]`)).toBeNull()
    expect(screen.getByLabelText('Sales Orders cells').style.getPropertyValue('--grid-window-offset'))
      .toBe('0px')

    act(() => nextProjection.resolve(projectionResultFor(requests[1]!)))
    await waitFor(() => {
      expect(document.querySelector(`[data-cell="${requests[1]!.window.rowEnd}:0"]`)).not.toBeNull()
    })
  })

  it('keeps selection navigation active while the next projection is pending', async () => {
    const nextProjection = deferredProjection<VisibleProjectionResult>()
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = vi.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return requests.length === 1 ? projectionResultFor(request) : nextProjection.promise
    })
    const store = renderSalesOrdersProjectionWorksheet(
      createTestRustWorkbookConnection({ readVisibleProjection }),
    )
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())
    const scroll = screen.getByTestId('sheet-scroll')

    fireEvent.scroll(scroll, { target: { scrollTop: 64 * WORKBOOK_GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests).toHaveLength(2))
    const grid = screen.getByLabelText('Sales Orders cells')
    grid.focus()

    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(1)
    act(() => nextProjection.resolve(projectionResultFor(requests[1]!)))
    await waitFor(() => expect(grid).toHaveAttribute('data-projection-retained', 'false'))
  })

  it('never relocates distant retained data or exposes stale interactions', async () => {
    const nextProjection = deferredProjection<VisibleProjectionResult>()
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = vi.fn(async (request: VisibleProjectionRequest) => {
      requests.push(request)
      return requests.length === 1 ? projectionResultFor(request) : nextProjection.promise
    })
    const store = renderSalesOrdersProjectionWorksheet(
      createTestRustWorkbookConnection({ readVisibleProjection }),
    )
    await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).not.toBeNull())

    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 1_200 },
      scrollHeight: {
        configurable: true,
        value: SALES_ORDER_SHEET_ROW_COUNT * WORKBOOK_GRID_ROW_HEIGHT,
      },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: 400 * WORKBOOK_GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests).toHaveLength(2))

    expect(requests[1]!.window.rowStart).toBeLessThan(400)
    expect(requests[1]!.window.rowEnd).toBeGreaterThan(400)
    const grid = screen.getByLabelText('Sales Orders cells')
    const frameTop = Number.parseFloat(grid.style.getPropertyValue('--grid-window-offset'))
    const frameBottom = frameTop + (requests[0]!.window.rowEnd + 1) * WORKBOOK_GRID_ROW_HEIGHT
    expect(frameTop).toBe(0)
    expect(frameBottom).toBeLessThan(scroll.scrollTop)
    expect(grid).toHaveAttribute('data-projection-retained', 'true')
    expect(grid).toHaveAttribute('tabindex', '-1')

    const retainedCell = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
    dispatchProjectionPointer(retainedCell, 'pointerdown')
    dispatchProjectionPointer(retainedCell, 'pointerup')
    fireEvent.doubleClick(retainedCell)
    grid.focus()
    fireEvent.keyDown(grid, { key: 'F2' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 0 })
    expect(store.getter(editingSessionAtom).source).toBeNull()

    expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('Order')
    expect(document.querySelector('[data-cell="400:0"]')).toBeNull()
    expect(document.querySelectorAll('td')).toHaveLength(
      (requests[0]!.window.rowEnd + 1) * (requests[0]!.window.colEnd + 1),
    )

    act(() => nextProjection.resolve(projectionResultFor(requests[1]!)))
    const readyCell = await waitFor(() => {
      const cell = document.querySelector<HTMLElement>('[data-cell="400:1"]')
      expect(cell).toHaveTextContent('R400C1')
      return cell!
    })
    expect(grid).toHaveAttribute('data-projection-retained', 'false')
    expect(grid).toHaveAttribute('tabindex', '0')
    expect(grid.style.getPropertyValue('--grid-window-offset')).toBe(
      `${requests[1]!.window.rowStart * WORKBOOK_GRID_ROW_HEIGHT}px`,
    )

    dispatchProjectionPointer(readyCell as HTMLElement, 'pointerdown')
    dispatchProjectionPointer(readyCell as HTMLElement, 'pointerup')
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 400, col: 1 })
    fireEvent.doubleClick(readyCell)
    expect(store.getter(editingSessionAtom).source).toMatchObject({
      sheetId: 'orders',
      cell: { row: 400, col: 1 },
    })
  })
})
