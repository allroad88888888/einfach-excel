import { createStore } from '@einfach/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type {
  RustClipboardPasteRequest,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { WorkbookView } from '../../../src/workbook/shell/WorkbookView'
import {
  writeBrowserClipboard,
  readBrowserClipboard,
} from '../../../src/workbook/clipboard/browser-clipboard'
import type * as BrowserClipboard from '../../../src/workbook/clipboard/browser-clipboard'
import { initializeSalesOrdersStore } from '../../support/initialize-sales-orders-store'
import { createTestRustWorkbookConnection } from '../../support/rust-workbook-connection'

vi.mock('../../../src/workbook/clipboard/browser-clipboard', async (original) => ({
  ...(await original<typeof BrowserClipboard>()),
  writeBrowserClipboard: vi.fn(async (data) => {
    await data
  }),
  readBrowserClipboard: vi.fn(async () => ({ text: 'new' })),
}))
afterEach(() => vi.clearAllMocks())

async function setup() {
  const store = createStore()
  initializeSalesOrdersStore(store)
  const projection = (request: VisibleProjectionRequest, revision = 0) => ({
    ...request,
    revision,
    cells: [{ row: 0, col: 0, displayValue: revision ? 'new' : 'old' }],
  })
  const capture = vi.fn(async ({ cut }: { cut: boolean }) => ({
    text: 'old',
    rows: 1,
    cols: 1,
    cut,
    token: '00000000-0000-0000-0000-000000000001',
  }))
  const paste = vi.fn(
    async (request: RustClipboardPasteRequest, visible: VisibleProjectionRequest) => ({
      acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
      projection: projection(visible, 1),
    }),
  )
  const connection = createTestRustWorkbookConnection({
    captureClipboard: capture,
    pasteClipboard: paste,
    readVisibleProjection: async (request) => projection(request),
  })
  render(
    <WorkbookStoreProvider store={store} connection={connection}>
      <WorkbookView />
    </WorkbookStoreProvider>,
  )
  await waitFor(() => expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('old'))
  return { capture, paste, grid: screen.getByLabelText('Sales Orders cells') }
}

describe('workbook system clipboard', () => {
  test.each([
    ['Paste values only', 'values'],
    ['Paste formatting only', 'formats'],
  ])('toolbar %s uses the same paste command with its mode', async (name, mode) => {
    const { paste } = await setup()
    fireEvent.click(screen.getByRole('button', { name }))
    await waitFor(() => expect(paste).toHaveBeenCalledTimes(1))
    expect(paste.mock.calls[0][0]).toMatchObject({
      mode,
      selection: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    })
  })
  test('toolbar copy/cut/paste use the real command atoms and show feedback', async () => {
    const { capture, paste } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Clipboard status')).toHaveTextContent('Copied'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cut' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Clipboard status')).toHaveTextContent('ready to move'),
    )
    expect(capture.mock.calls.map(([request]) => request.cut)).toEqual([false, true])
    expect(writeBrowserClipboard).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await waitFor(() =>
      expect(document.querySelector('[data-cell="0:0"]')).toHaveTextContent('new'),
    )
    expect(paste).toHaveBeenCalledTimes(1)
  })

  test('native paste captures DataTransfer during the event and forwards its token', async () => {
    const { paste, grid } = await setup()
    const token = '00000000-0000-0000-0000-000000000001'
    fireEvent.paste(grid, {
      clipboardData: {
        types: ['text/plain', 'text/html'],
        getData: (type: string) =>
          type === 'text/plain' ? 'new' : `<pre data-einfach-clipboard="${token}">new</pre>`,
      },
    })
    await waitFor(() => expect(paste).toHaveBeenCalledTimes(1))
    expect(paste.mock.calls[0][0]).toMatchObject({ text: 'new', token })
    expect(readBrowserClipboard).not.toHaveBeenCalled()
  })

  test('permission rejection displays an error without sending a paste', async () => {
    const { paste } = await setup()
    vi.mocked(readBrowserClipboard).mockRejectedValueOnce(new Error('Clipboard denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await waitFor(() =>
      expect(screen.getByRole('alert', { name: 'Clipboard status' })).toHaveTextContent(
        'Clipboard denied',
      ),
    )
    expect(paste).not.toHaveBeenCalled()
  })

  test('input editing leaves native paste untouched and disables the toolbar actions', async () => {
    const { paste } = await setup()
    fireEvent.doubleClick(document.querySelector('[data-cell="0:0"]')!)
    const editor = await screen.findByRole('textbox', { name: 'Cell editor' })
    const event = new Event('paste', { bubbles: true, cancelable: true })
    fireEvent(editor, event)
    expect(event.defaultPrevented).toBe(false)
    expect(paste).not.toHaveBeenCalled()
    for (const name of ['Copy', 'Cut', 'Paste', 'Paste values only', 'Paste formatting only'])
      expect(screen.getByRole('button', { name })).toBeDisabled()
  })
})
