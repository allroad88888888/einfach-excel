import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type {
  RustClipboardPasteRequest,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import { readBrowserClipboard } from '../../../src/workbook/clipboard/browser-clipboard'
import type * as BrowserClipboard from '../../../src/workbook/clipboard/browser-clipboard'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

vi.mock('../../../src/workbook/clipboard/browser-clipboard', async (original) => ({
  ...(await original<typeof BrowserClipboard>()),
  readBrowserClipboard: vi.fn(async () => ({ text: '2' })),
}))
afterEach(() => vi.clearAllMocks())

async function setup() {
  const store = createStore()
  initializeSalesOrdersStore(store)
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, projection: VisibleProjectionRequest) => ({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: {
        ...projection,
        revision: 1,
        cells: [{ row: 0, col: 0, displayValue: 'pasted' }],
      },
    }),
  )
  const connection = createTestRustWorkbookConnection({
    pasteClipboard: paste,
    readVisibleProjection: async (request) => ({
      ...request,
      revision: 0,
      cells: [{ row: 0, col: 0, displayValue: 'old' }],
    }),
  })
  render(
    <WorkbookStoreProvider store={store} connection={connection}>
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('old'))
  fireEvent.click(screen.getByRole('button', { name: 'Paste special' }))
  await screen.findByRole('dialog', { name: 'Paste special' })
  return { paste }
}

test('the dialog combines options using atom commands and closes after a successful paste', async () => {
  const { paste } = await setup()
  fireEvent.change(screen.getByLabelText('Paste content'), { target: { value: 'values' } })
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'divide' } })
  fireEvent.click(screen.getByLabelText('Transpose'))
  fireEvent.click(screen.getByLabelText('Skip blanks'))
  fireEvent.click(screen.getByRole('button', { name: 'Apply paste' }))
  await waitFor(() => expect(paste).toHaveBeenCalledTimes(1))
  expect(paste.mock.calls[0][0]).toMatchObject({
    mode: 'values',
    arithmetic: 'divide',
    transpose: true,
    skipBlanks: true,
  })
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Paste special' })).toBeNull())
  expect(screen.getByRole('button', { name: 'Paste special' })).toHaveFocus()
})

test('width-only mode disables incompatible controls and cancellation performs no clipboard read', async () => {
  const { paste } = await setup()
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'multiply' } })
  fireEvent.click(screen.getByLabelText('Transpose'))
  fireEvent.change(screen.getByLabelText('Paste content'), { target: { value: 'column-widths' } })
  expect(screen.getByLabelText('Operation')).toHaveValue('none')
  await waitFor(() => expect(screen.getByLabelText('Operation')).toBeDisabled())
  expect(screen.getByLabelText('Transpose')).not.toBeChecked()
  expect(screen.getByLabelText('Transpose')).toBeDisabled()
  expect(screen.getByLabelText('Skip blanks')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(readBrowserClipboard).not.toHaveBeenCalled()
  expect(paste).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Paste special' }))
  await waitFor(() => expect(screen.getByLabelText('Paste content')).toHaveValue('all'))
})

test('permission errors stay inside the dialog and can be retried with the same options', async () => {
  const { paste } = await setup()
  vi.mocked(readBrowserClipboard).mockRejectedValueOnce(new Error('Clipboard denied'))
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'divide' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply paste' }))
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Clipboard denied'))
  expect(screen.getByLabelText('Operation')).toHaveValue('divide')
  expect(paste).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply paste' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(paste).toHaveBeenCalledTimes(1)
})

test('pending browser permission disables every mutation control and blocks Escape closing', async () => {
  await setup()
  let finish!: (value: { text: string }) => void
  vi.mocked(readBrowserClipboard).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Apply paste' }))
  await waitFor(() => expect(readBrowserClipboard).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Pasting…'))
  expect(screen.getByLabelText('Paste content')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => finish({ text: '2' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})
