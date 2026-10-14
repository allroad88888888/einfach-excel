import { createStore } from '@einfach/core'
import {
  type EditingCommitRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'
import {
  createControlledCellEditingConnection, dispatchEditingPointer, firstEditingCell,
  renderSalesOrdersEditingWorksheet,
} from '../../support/cell-editing-harness'

describe('continuous Rust cell editing', () => {
  it.each([
    ['cell', 'blur'], ['formula-bar', 'blur'], ['cell', 'Enter'], ['formula-bar', 'Enter'],
  ] as const)(
    '%s %s finishes before the pending double-click opens its next editor', async (source, trigger) => {
      const controlled = createControlledCellEditingConnection()
      const write = controlled.setCellInput.getMockImplementation()!
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      controlled.setCellInput.mockImplementationOnce(async (request) => {
        await gate
        return write(request)
      })
      renderSalesOrdersEditingWorksheet(controlled)
      const first = await firstEditingCell()
      if (source === 'cell') fireEvent.doubleClick(first)
      const input = screen.getByRole('textbox', {
        name: source === 'cell' ? 'Cell editor' : 'Active cell value',
      })
      act(() => input.focus())
      if (source === 'cell') fireEvent.change(input, { target: { value: 'First edit' } })
      else fireEvent.input(input, { target: { value: 'First edit' } })
      if (trigger === 'Enter') fireEvent.keyDown(input, { key: 'Enter' })
      const next = document.querySelector<HTMLElement>('[data-cell="1:1"]')!
      await act(async () => {
        screen.getByLabelText('Sales Orders cells').focus()
        dispatchEditingPointer(next, 'pointerdown', 9)
        dispatchEditingPointer(next, 'pointerup', 9)
        fireEvent.doubleClick(next)
      })
      expect(input).toBeDisabled()
      expect(input).toHaveValue('First edit')
      await act(async () => release())
      await waitFor(() => expect(first).toHaveTextContent('First edit'))
      const editor = screen.getByRole('textbox', { name: 'Cell editor' })
      expect(editor).toHaveValue('R1C1')
      expect(editor).toHaveFocus()
      fireEvent.change(editor, { target: { value: 'Second edit' } })
      fireEvent.keyDown(editor, { key: 'Enter' })
      await waitFor(() => expect(next).toHaveTextContent('Second edit'))
      expect(controlled.setCellInput.mock.calls.map(([request]) =>
        [request.row, request.col, request.input])).toEqual([
        [0, 0, 'First edit'], [1, 1, 'Second edit'],
      ])
    },
  )

  it('edits two different cells without reusing the first mutation or draft', async () => {
    const values = new Map<string, string>()
    let revision = 0
    const readVisibleProjection = vi.fn(
      async (request: VisibleProjectionRequest): Promise<VisibleProjectionResult> => {
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
      },
    )
    const setCellInput = vi.fn(async (request: EditingCommitRequest) => {
      values.set(`${request.row}:${request.col}`, request.input)
      revision += 1
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision,
      }
    })
    const connection = createTestRustWorkbookConnection({ readVisibleProjection, setCellInput })
    const store = createStore()
    initializeSalesOrdersStore(store)
    render(
      <WorkbookStoreProvider connection={connection} store={store}>
        <WorkbookView />
      </WorkbookStoreProvider>,
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
