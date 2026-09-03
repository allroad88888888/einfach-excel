import { createStore } from '@einfach/core'
import {
  selectionSnapshotAtom,
  viewportMetricsAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
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
    cells: [
      {
        row: request.window.rowStart,
        col: 1,
        displayValue: `B${request.window.rowStart + 1}`,
      },
    ],
  }
}

function renderWorkbook() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
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
  it('moves the selection, viewport and Rust projection to an entered address', async () => {
    const { requests, store } = renderWorkbook()
    await waitFor(() => expect(requests).toHaveLength(1))
    const nameBox = screen.getByRole('textbox', { name: 'Name box' })

    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'B100' } })
    fireEvent.keyDown(nameBox, { key: 'Enter' })

    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 99, col: 1 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(99 * WORKBOOK_GRID_ROW_HEIGHT)
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.window.rowStart).toBe(99)
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
