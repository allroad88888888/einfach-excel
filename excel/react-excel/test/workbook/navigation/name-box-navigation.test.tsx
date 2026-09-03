import { createStore } from '@einfach/core'
import {
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  viewportMetricsAtom,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../src/product/sales-orders/data/sheet'
import { GRID_ROW_HEIGHT } from '../../../src/workbook/projection/use-grid-window'
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

const { Workbook } = jest.requireActual('../../../src/workbook/shell/Workbook') as {
  Workbook: ComponentType
}

function projectionFor(request: VisibleProjectionRequest): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    requestId: request.requestId,
    sheetId: request.sheetId,
    window: request.window,
    cells: [{
      row: request.window.rowStart,
      col: 1,
      displayValue: `B${request.window.rowStart + 1}`,
    }],
  }
}

function renderWorkbook() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
    requests.push(request)
    return projectionFor(request)
  })
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: SALES_ORDER_SHEET_ROW_COUNT,
    colCount: SALES_ORDER_COLUMNS.length,
  })
  render(
    <WorkbookRuntimeProvider
      connection={createTestRustWorkbookConnection({ readVisibleProjection })}
      store={store}
    >
      <Workbook />
    </WorkbookRuntimeProvider>,
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
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(99 * GRID_ROW_HEIGHT)
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]?.window.rowStart).toBe(99)
    await waitFor(() => expect(document.querySelector('[data-cell="99:1"]')).toHaveTextContent('B100'))
    expect(nameBox).toHaveValue('B100')
    expect(screen.getByLabelText('One thousand sales order records')).toHaveFocus()
  })

  it('restores the selected address when Escape cancels typing', async () => {
    renderWorkbook()
    const nameBox = await screen.findByRole('textbox', { name: 'Name box' })

    fireEvent.focus(nameBox)
    fireEvent.input(nameBox, { target: { value: 'B100' } })
    fireEvent.keyDown(nameBox, { key: 'Escape' })

    expect(nameBox).toHaveValue('A1')
    expect(screen.getByLabelText('One thousand sales order records')).toHaveFocus()
  })
})
