import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  setMultiRegionSelectionAtom, type RustClearRangeRequest,
  type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { ClearTools } from '../../../src/workbook/chrome/ribbon/ClearTools'
import { WorkbookFooter } from '../../../src/workbook/chrome/footer/WorkbookFooter'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

async function setup() {
  const project = (request: VisibleProjectionRequest) => ({ ...request, cells: [], revision: 1 })
  const clear = vi.fn(async (
    request: RustClearRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
    projection: project(projection),
  }))
  const { store } = createSpreadsheetUi({ connection: createTestRustWorkbookConnection({
    clearRange: clear, readVisibleProjection: async (request) => project(request),
  }) })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 10, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  store.setter(setMultiRegionSelectionAtom, { regions: [1, 4].map((row) => ({
    kind: 'cell' as const, sheetId: 's', anchor: { row, col: 2 }, focus: { row, col: 2 },
  })) })
  render(<WorkbookStoreProvider store={store}>
    <ClearTools /><WorkbookFooter />
  </WorkbookStoreProvider>)
  return clear
}

test.each([
  ['Clear contents', 'contents'], ['Clear formatting', 'formats'], ['Clear all', 'all'],
])('%s sends all areas from its command atom', async (name, mode) => {
  const clear = await setup()
  fireEvent.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(clear).toHaveBeenCalledTimes(1))
  expect(clear.mock.calls[0][0]).toMatchObject({ mode, targets: [
    { rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2, scope: 'cell' },
    { rowStart: 4, rowEnd: 4, colStart: 2, colEnd: 2, scope: 'cell' },
  ] })
  expect(screen.getByRole('status', { name: 'Multi-area selection' }))
    .toHaveTextContent('Clear and formatting apply to all areas')
})

test('pending buttons disable together; a native rejection is visible and permits retry', async () => {
  const clear = await setup()
  let reject!: (error: Error) => void
  clear.mockImplementationOnce(() => new Promise<never>((_, fail) => { reject = fail }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  await screen.findByText('Updating selection…')
  for (const name of ['Clear contents', 'Clear formatting', 'Clear all'])
    expect(screen.getByRole('button', { name })).toBeDisabled()
  await act(async () => { reject(new Error('Include its formula cell.')) })
  expect(await screen.findByRole('alert', { name: 'Selection change error' }))
    .toHaveTextContent('Include its formula cell.')
  fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }))
  await waitFor(() => expect(clear).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert', { name: 'Selection change error' })).toBeNull())
})
