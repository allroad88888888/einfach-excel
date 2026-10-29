import { createStore } from '@einfach/core'
import {
  selectionSnapshotAtom,
  viewportMetricsAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach-excel/spreadsheet-ui-core'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../../../src/workbook/grid/viewport/workbook-grid-config'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

function projectionFor(request: VisibleProjectionRequest): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    requestId: request.requestId,
    sheetId: request.sheetId,
    window: request.window,
    cells: Array.from({ length: request.window.rowEnd - request.window.rowStart + 1 }, (_, index) =>
      ({
        row: request.window.rowStart + index,
        col: 1,
        displayValue: `B${request.window.rowStart + index + 1}`,
      }),
    ),
  }
}

function renderWorkbook() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = vi.fn(async (request: VisibleProjectionRequest) => {
    requests.push(request)
    return projectionFor(request)
  })
  const store = createStore()
  initializeSalesOrdersStore(store)
  render(
    <WorkbookStoreProvider
      connection={createTestRustWorkbookConnection({ readVisibleProjection })}
      store={store}
    >
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  return { requests, store }
}

describe('workbook name box navigation', () => {
  it('reveals the bottom-right corner of a range using the measured viewport', async () => {
    const { requests, store } = renderWorkbook()
    await waitFor(() => expect(requests).toHaveLength(1))
    Object.defineProperties(screen.getByTestId('sheet-scroll'), {
      clientWidth: { value: 333 }, clientHeight: { value: 600 },
    })
    const nameBox = screen.getByRole('textbox', { name: 'Name box' })
    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'C40:D41' } })
    fireEvent.keyDown(nameBox, { key: 'Enter' })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      scrollTop: 41 * WORKBOOK_GRID_ROW_HEIGHT - 572, scrollLeft: 193,
    })
    expect(store.getter(selectionSnapshotAtom).range)
      .toEqual({ rowStart: 39, rowEnd: 40, colStart: 2, colEnd: 3 })
    await waitFor(() => expect(requests.at(-1)?.window.rowEnd).toBeGreaterThanOrEqual(40))
    expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
  })

  it('selects an already visible cell without scrolling or requesting a new projection', async () => {
    const { requests, store } = renderWorkbook()
    await waitFor(() => expect(requests).toHaveLength(1))
    const nameBox = screen.getByRole('textbox', { name: 'Name box' })
    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'B8' } })
    fireEvent.keyDown(nameBox, { key: 'Enter' })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 7, col: 1 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 0 })
    expect(requests).toHaveLength(1)
    expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
  })

  it('uses the current DOM width when a resize has not reached the viewport atom yet', async () => {
    const { requests, store } = renderWorkbook()
    await waitFor(() => expect(requests).toHaveLength(1))
    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientWidth: { value: 333 }, clientHeight: { value: 600 },
    })
    const nameBox = screen.getByRole('textbox', { name: 'Name box' })
    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'D2' } })
    fireEvent.keyDown(nameBox, { key: 'Enter' })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      viewportWidth: 287, viewportHeight: 572, scrollLeft: 193,
    })
    await waitFor(() => expect(requests.at(-1)?.window.colEnd).toBeGreaterThanOrEqual(3))
  })

  it('moves the selection, viewport and Rust projection to an entered address', async () => {
    const { requests, store } = renderWorkbook()
    await waitFor(() => expect(requests).toHaveLength(1))
    const nameBox = screen.getByRole('textbox', { name: 'Name box' })

    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'B100' } })
    fireEvent.keyDown(nameBox, { key: 'Enter' })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 99, col: 1 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(
      100 * WORKBOOK_GRID_ROW_HEIGHT - store.getter(viewportMetricsAtom).viewportHeight,
    )
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.window.rowStart).toBeLessThan(99)
    expect(requests[1]?.window.rowEnd).toBeGreaterThanOrEqual(99)
    await waitFor(() =>
      expect(document.querySelector('[data-cell="99:1"]')).toHaveTextContent('B100'),
    )
    expect(nameBox).toHaveValue('B100')
    expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
  })

  it('restores the selected address when Escape cancels typing', async () => {
    renderWorkbook()
    const nameBox = await screen.findByRole('textbox', { name: 'Name box' })

    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'B100' } })
    fireEvent.keyDown(nameBox, { key: 'Escape' })

    expect(nameBox).toHaveValue('A1')
    expect(screen.getByLabelText('Sales Orders cells')).toHaveFocus()
  })
})
