import { createStore } from '@einfach/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { RustClipboardPasteRequest, VisibleProjectionRequest } from '@einfach-excel/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import type * as BrowserClipboard from '../../../src/workbook/clipboard/browser-clipboard'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

vi.mock('../../../src/workbook/clipboard/browser-clipboard', async (original) => ({
  ...(await original<typeof BrowserClipboard>()),
  writeBrowserClipboard: vi.fn(async (pending) => { await pending }),
}))
afterEach(() => vi.clearAllMocks())

async function setup(error?: string) {
  const store = createStore()
  initializeSalesOrdersStore(store)
  const token = '00000000-0000-0000-0000-000000000001'
  const capture = vi.fn(async ({ cut }: { cut: boolean }) => ({ text: 'old', rows: 1, cols: 1, cut, token }))
  const project = (request: VisibleProjectionRequest, revision = 0) => ({
    ...request, revision, cells: [{ row: 0, col: 0, displayValue: revision ? 'moved' : request.sheetId }],
  })
  const paste = vi.fn(async (
    request: RustClipboardPasteRequest, projection: VisibleProjectionRequest,
  ) => {
    if (error) throw new Error(error)
    return { acknowledgement: {
      sheetId: request.sheetId, requestId: request.requestId, revision: 1,
    },
      projection: project(projection, 1) }
  })
  const connection = createTestRustWorkbookConnection({
    captureClipboard: capture, pasteClipboard: paste,
    readVisibleProjection: async (request) => project(request),
  })
  render(<WorkbookStoreProvider store={store} connection={connection}>
    <WorkbookView />
  </WorkbookStoreProvider>)
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('orders'))
  return { capture, paste, token }
}

test('XSCUT native cut then target tab and native paste forward one token through real DOM handlers', async () => {
  const { capture, paste, token } = await setup()
  fireEvent.cut(screen.getByLabelText('Sales Orders cells'))
  await waitFor(() => expect(screen.getByLabelText('Clipboard status')).toHaveTextContent('ready to move'))
  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true'))
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('summary'))
  fireEvent.paste(screen.getByLabelText('Summary cells'), { clipboardData: {
    types: ['text/plain', 'text/html'],
    getData: (type: string) => type === 'text/plain' ? 'old' : `<pre data-einfach-clipboard="${token}">old</pre>`,
  } })
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('moved'))
  expect(capture).toHaveBeenCalledTimes(1)
  expect(paste).toHaveBeenCalledTimes(1)
  expect(paste.mock.calls[0][0]).toMatchObject({ sheetId: 'summary', text: 'old', token })
})

test('XSCUT target structure rejection appears through the existing clipboard status DOM', async () => {
  const { token, paste } = await setup('CLIPBOARD_CROSS_SHEET_MERGE')
  fireEvent.cut(screen.getByLabelText('Sales Orders cells'))
  await waitFor(() => expect(screen.getByLabelText('Clipboard status')).toHaveTextContent('ready to move'))
  fireEvent.click(screen.getByRole('tab', { name: 'Summary' }))
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('summary'))
  fireEvent.paste(screen.getByLabelText('Summary cells'), { clipboardData: {
    types: ['text/plain', 'text/html'],
    getData: (type: string) => type === 'text/plain' ? 'old' : `<pre data-einfach-clipboard="${token}">old</pre>`,
  } })
  await waitFor(() => expect(screen.getByRole('alert', { name: 'Clipboard status' })).toHaveTextContent('No cells were moved.'))
  expect(paste).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('summary')
})
