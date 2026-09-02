import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
  type BackendMutationResult,
  type EditingCommitRequest,
  type SpreadsheetBackend,
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

const { Workbook } = jest.requireActual('../../../src/workbook/shell/Workbook') as {
  Workbook: ComponentType
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

describe('pending edit projection scrolling', () => {
  it('keeps the newly visible window after the mutation acknowledgement refresh', async () => {
    const mutation = deferred<BackendMutationResult>()
    let mutationRequest: EditingCommitRequest | undefined
    const requests: VisibleProjectionRequest[] = []
    const readVisibleProjection = jest.fn(async (
      request: VisibleProjectionRequest,
    ): Promise<VisibleProjectionResult> => {
      requests.push(request)
      const cells = []
      for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
        for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
          cells.push({ row, col, displayValue: `R${row}C${col}` })
        }
      }
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        window: request.window,
        cells,
      }
    })
    const setCellInput = jest.fn((request: EditingCommitRequest) => {
      mutationRequest = request
      return mutation.promise
    })
    const store = createStore()
    store.setter(setSelectionBoundsAtom, {
      rowCount: SALES_ORDER_SHEET_ROW_COUNT,
      colCount: SALES_ORDER_COLUMNS.length,
    })
    render(
      <WorkbookRuntimeProvider
        backend={{ readVisibleProjection, setCellInput } as unknown as SpreadsheetBackend}
        store={store}
      >
        <Workbook />
      </WorkbookRuntimeProvider>,
    )

    const first = await waitFor(() => {
      const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')
      expect(cell).not.toBeNull()
      return cell!
    })
    fireEvent.doubleClick(first)
    const editor = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Cell editor' })
    fireEvent.change(editor, { target: { value: 'Slow edit' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    await waitFor(() => expect(setCellInput).toHaveBeenCalledTimes(1))

    const scroll = screen.getByTestId('sheet-scroll')
    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 1_200 },
      scrollHeight: {
        configurable: true,
        value: (SALES_ORDER_SHEET_ROW_COUNT + 1) * GRID_ROW_HEIGHT,
      },
    })
    fireEvent.scroll(scroll, { target: { scrollTop: 20 * GRID_ROW_HEIGHT } })
    await waitFor(() => expect(requests.map((request) => request.window.rowStart)).toContain(20))
    await waitFor(() => expect(document.querySelector('[data-cell="20:0"]')).not.toBeNull())

    if (mutationRequest === undefined) throw new Error('Expected the mutation to start.')
    mutation.resolve({
      sheetId: mutationRequest.sheetId,
      requestId: mutationRequest.requestId,
      revision: 1,
    })

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())
    await waitFor(() => expect(requests.map((request) => request.window.rowStart)).toEqual([
      0,
      20,
      20,
    ]))
    expect(document.querySelector('[data-cell="20:0"]')).toHaveTextContent('R20C0')
    expect(setCellInput).toHaveBeenCalledTimes(1)
  })
})
