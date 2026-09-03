import { createStore } from '@einfach/core'
import {
  editingSessionAtom,
  type EditingCommitRequest,
  type VisibleProjectionRequest,
  type VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

function renderFormulaWorkbook() {
  const values = new Map([['0:0', 'Order']])
  let revision = 0
  const readVisibleProjection = jest.fn(
    async (request: VisibleProjectionRequest): Promise<VisibleProjectionResult> => ({
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision,
      window: request.window,
      cells: Array.from(values, ([key, displayValue]) => {
        const [row, col] = key.split(':').map(Number)
        return { row: row!, col: col!, displayValue }
      }),
    }),
  )
  const setCellInput = jest.fn(async (request: EditingCommitRequest) => {
    values.set(`${request.row}:${request.col}`, request.input)
    revision += 1
    return { sheetId: request.sheetId, requestId: request.requestId, revision }
  })
  const store = createStore()
  initializeSalesOrdersStore(store)
  render(
    <WorkbookStoreProvider
      connection={createTestRustWorkbookConnection({ readVisibleProjection, setCellInput })}
      store={store}
    >
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  return { readVisibleProjection, setCellInput, store }
}

describe('formula bar editing', () => {
  it('writes the active cell through the existing Rust editing command', async () => {
    const controlled = renderFormulaWorkbook()
    const formulaInput = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Active cell value',
    })
    await waitFor(() => expect(formulaInput).toHaveValue('Order'))

    fireEvent.input(formulaInput, { target: { value: '=1+2' } })
    expect(controlled.store.getter(editingSessionAtom)).toMatchObject({
      source: { sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'formula-bar' },
    })
    expect(controlled.store.getter(editingSessionAtom).draft).toBe('=1+2')
    fireEvent.keyDown(formulaInput, { key: 'Enter' })

    await waitFor(() => expect(controlled.setCellInput).toHaveBeenCalledTimes(1))
    expect(controlled.setCellInput).toHaveBeenCalledWith(
      expect.objectContaining({ row: 0, col: 0, input: '=1+2' }),
    )
    await waitFor(() => expect(formulaInput).toHaveValue('=1+2'))
    expect(controlled.readVisibleProjection).toHaveBeenCalledTimes(2)
  })

  it('moves an in-cell draft into the formula bar without committing early', async () => {
    const controlled = renderFormulaWorkbook()
    const firstCell = await waitFor(() => {
      const cell = document.querySelector<HTMLElement>('[data-cell="0:0"]')
      expect(cell).not.toBeNull()
      return cell!
    })
    fireEvent.doubleClick(firstCell)
    const cellEditor = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'Cell editor',
    })
    fireEvent.change(cellEditor, { target: { value: 'Shared draft' } })
    const formulaInput = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Active cell value',
    })
    fireEvent.input(formulaInput, { target: { value: 'Formula draft' } })

    expect(controlled.setCellInput).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Cell editor' })).toBeNull()
    })
    expect(formulaInput).toHaveValue('Formula draft')
    expect(controlled.store.getter(editingSessionAtom).source?.source).toBe('formula-bar')
  })
})
