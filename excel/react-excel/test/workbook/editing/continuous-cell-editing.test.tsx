import { createStore } from '@einfach/core'
import {
  setSelectionBoundsAtom,
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
import { WorkbookRuntimeProvider } from '../../../src/workbook/runtime/WorkbookRuntimeProvider'

const { Workbook } = jest.requireActual('../../../src/workbook/shell/Workbook') as {
  Workbook: ComponentType
}

describe('continuous Rust cell editing', () => {
  it('edits two different cells without reusing the first mutation or draft', async () => {
    const values = new Map<string, string>()
    let revision = 0
    const readVisibleProjection = jest.fn(async (
      request: VisibleProjectionRequest,
    ): Promise<VisibleProjectionResult> => {
      const cells = []
      for (let row = request.window.rowStart; row <= request.window.rowEnd; row += 1) {
        for (let col = request.window.colStart; col <= request.window.colEnd; col += 1) {
          cells.push({
            row,
            col,
            displayValue: values.get(`${row}:${col}`) ?? `R${row}C${col}`,
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
    })
    const setCellInput = jest.fn(async (request: EditingCommitRequest) => {
      values.set(`${request.row}:${request.col}`, request.input)
      revision += 1
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision,
      }
    })
    const backend = { readVisibleProjection, setCellInput } as unknown as SpreadsheetBackend
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

    const first = await waitFor(() => {
      const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')
      expect(cell).not.toBeNull()
      return cell!
    })
    fireEvent.doubleClick(first)
    const firstEditor = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Cell editor',
    })
    fireEvent.change(firstEditor, { target: { value: 'First edit' } })
    fireEvent.keyDown(firstEditor, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull())

    const second = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
    fireEvent.doubleClick(second)
    const secondEditor = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Cell editor',
    })
    expect(secondEditor).toHaveValue('R1C1')
    fireEvent.change(secondEditor, { target: { value: 'Second edit' } })
    fireEvent.keyDown(secondEditor, { key: 'Enter' })

    await waitFor(() => expect(setCellInput).toHaveBeenCalledTimes(2))
    expect(
      setCellInput.mock.calls.map(([request]) => [request.row, request.col, request.input]),
    ).toEqual([
      [0, 0, 'First edit'],
      [1, 1, 'Second edit'],
    ])
  })
})
