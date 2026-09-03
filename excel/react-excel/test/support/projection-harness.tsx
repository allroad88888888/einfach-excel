import { createStore, type Store } from '@einfach/core'
import {
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react'
import { SALES_ORDER_COLUMNS } from '../../src/page/demo/sales-orders/data/sheet'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../src/workbook/shell/WorkbookView'
import { initializeSalesOrdersStore } from './initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from './rust-workbook-connection'

/** Builds Sales Orders workbook fixtures for projection behavior tests. */
export function projectionResultFor(request: VisibleProjectionRequest): VisibleProjectionResult {
  const cells = []
  for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
    for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
      cells.push({
        row,
        col,
        displayValue:
          row === 0
            ? (SALES_ORDER_COLUMNS[col]?.label ?? '')
            : col === 0
              ? `SO-${String(10_000 + row)}`
              : `R${row}C${col}`,
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

export function deferredProjection<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

export function createProjectionConnection() {
  const requests: VisibleProjectionRequest[] = []
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) => {
    requests.push(request)
    return projectionResultFor(request)
  })
  return {
    connection: createTestRustWorkbookConnection({ readVisibleProjection }),
    readVisibleProjection,
    requests,
  }
}

export function renderSalesOrdersProjectionWorksheet(connection: RustWorkbookConnection): Store {
  const store = createStore()
  initializeSalesOrdersStore(store)
  render(
    <WorkbookStoreProvider connection={connection} store={store}>
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  return store
}

export function dispatchProjectionPointer(
  target: HTMLElement,
  type: 'pointerdown' | 'pointerup',
): void {
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
