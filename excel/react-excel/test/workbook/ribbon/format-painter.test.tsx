import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, selectCellAtom, runVisibleProjectionAtom,
  startCellEditingFromProjectionAtom } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { FormatPainterTools } from '../../../src/workbook/chrome/ribbon/FormatPainterTools'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

async function setup() {
  const store = createStore()
  const capture = vi.fn(async () => ({ text: '', rows: 1, cols: 1, cut: false, token: 'brush' }))
  const connection = createTestRustWorkbookConnection({ captureClipboard: capture,
    readVisibleProjection: async (request) => ({ ...request,
      cells: [{ row: 0, col: 0, displayValue: 'value' }] }),
  })
  render(<WorkbookStoreProvider connection={connection} store={store}>
    <FormatPainterTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    store.setter(initializeWorkbookDocumentAtom, { title: 'Test',
      sheets: [{ id: 's', index: 0, name: 'Test', rowCount: 10, colCount: 10 }] })
    store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
    await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 } })
  })
  return { store, capture, button: screen.getByRole('button', { name: 'Format painter' }) }
}

test('single click arms, exposes instructions and a second click cancels', async () => {
  const { button, capture } = await setup()
  fireEvent.click(button, { detail: 1 })
  await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
  expect(button).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Format painter status')).toHaveTextContent('Select cells to paint')
  fireEvent.click(button, { detail: 1 })
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'))
  expect(capture).toHaveBeenCalledTimes(1)
})

test('double-click keeps painting without recapturing', async () => {
  const { button, capture } = await setup()
  fireEvent.click(button, { detail: 1 })
  fireEvent.click(button, { detail: 2 })
  fireEvent.doubleClick(button)
  await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
  expect(button).toHaveAttribute('data-painter-mode', 'sticky')
  expect(capture).toHaveBeenCalledTimes(1)
})

test('capture failure exposes an alert and leaves the button available to retry', async () => {
  const { button, capture } = await setup()
  capture.mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('offline'))
  expect(button).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(button)
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
})

test('cell editing disables capture rather than committing the draft implicitly', async () => {
  const { store, button, capture } = await setup()
  act(() => { store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 0, col: 0 } }) })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(capture).not.toHaveBeenCalled()
})
