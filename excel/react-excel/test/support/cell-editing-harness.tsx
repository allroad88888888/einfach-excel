import { createStore, type Store } from '@einfach/core'
import {
  type EditingCommitRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SALES_ORDER_COLUMNS } from '../../src/page/demo/sales-orders/data/sheet'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../src/workbook/shell/WorkbookView'
import { initializeSalesOrdersStore } from './initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from './rust-workbook-connection'

/** Builds controllable Sales Orders workbook fixtures for cell-editing tests. */
export interface ControlledCellEditingConnection {
  readonly connection: ReturnType<typeof createTestRustWorkbookConnection>
  readonly readVisibleProjection: jest.MockedFunction<
    (request: VisibleProjectionRequest) => Promise<VisibleProjectionResult>
  >
  readonly setCellInput: jest.MockedFunction<
    (request: EditingCommitRequest) => Promise<{
      sheetId: string
      requestId: number
      revision: number
    }>
  >
  readonly commands: string[]
  failNextMutation(message: string): void
}

export function createControlledCellEditingConnection(): ControlledCellEditingConnection {
  const values = new Map<string, string>()
  const commands: string[] = []
  let mutationFailure: string | undefined
  let revision = 0
  const project = (request: VisibleProjectionRequest): VisibleProjectionResult => {
    const cells = []
    for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
      for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
        cells.push({
          row,
          col,
          displayValue:
            values.get(`${row}:${col}`) ??
            (row === 0 ? SALES_ORDER_COLUMNS[col]!.label : `R${row}C${col}`),
        })
      }
    }
    return {
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      window: request.window,
      cells,
    }
  }
  const readVisibleProjection = jest.fn(async (request: VisibleProjectionRequest) =>
    project(request),
  )
  const setCellProjection = jest.fn(async (request: VisibleProjectionRequest) => project(request))
  const setCellInput = jest.fn(async (request: EditingCommitRequest) => {
    if (mutationFailure !== undefined) {
      const message = mutationFailure
      mutationFailure = undefined
      throw new Error(message)
    }
    values.set(`${request.row}:${request.col}`, request.input)
    revision += 1
    return { sheetId: request.sheetId, requestId: request.requestId, revision }
  })

  return {
    connection: createTestRustWorkbookConnection({
      onRequest: (command) => commands.push(command),
      readVisibleProjection,
      setCellInput,
      setCellProjection,
    }),
    readVisibleProjection,
    setCellInput,
    commands,
    failNextMutation: (message) => {
      mutationFailure = message
    },
  }
}

export function renderSalesOrdersEditingWorksheet(
  controlled: ControlledCellEditingConnection,
  store = createStore(),
): Store {
  initializeSalesOrdersStore(store)
  render(
    <WorkbookStoreProvider connection={controlled.connection} store={store}>
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  return store
}

export async function firstEditingCell(): Promise<HTMLElement> {
  return waitFor(() => {
    const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')
    expect(cell).not.toBeNull()
    return cell!
  })
}

export async function focusedCellEditor(): Promise<HTMLInputElement> {
  const editor = screen.getByRole<HTMLInputElement>('textbox', { name: 'Cell editor' })
  await waitFor(() => expect(document.activeElement).toBe(editor))
  return editor
}

export function dispatchEditingPointer(
  target: Element,
  type: 'pointerdown' | 'pointerup',
  pointerId: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: 180 },
    clientY: { value: 72 },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  })
  fireEvent(target, event)
}
