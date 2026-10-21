import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, startEditingAtom,
  type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../src/page/WorkbookStoreProvider'
import { WorkbookHeader } from '../../src/workbook/chrome/header/WorkbookHeader'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 10, colCount: 4 },
  ] })
  const request = vi.fn(async () => ({ text: '{"native":true}', filename: 'Book.einfach.json' }))
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><WorkbookHeader /></WorkbookStoreProvider>)
  return { store, request }
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test.each([false, true])('Tab shift=%s cycles inside the file dialog without Rust writes', async (shiftKey) => {
  const { request } = setup()
  await click('File')
  const first = screen.getByRole('button', { name: 'Download workbook' })
  const last = screen.getByRole('button', { name: 'Close' })
  const origin = shiftKey ? first : last
  origin.focus()
  expect(fireEvent.keyDown(origin, { key: 'Tab', shiftKey })).toBe(false)
  expect(shiftKey ? last : first).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('header tells the truth about in-memory state; File opens and closes with focus restoration', async () => {
  setup()
  expect(screen.queryByText('Saved locally')).toBeNull()
  expect(screen.getByText('In memory')).toBeVisible()
  await click('File')
  expect(screen.getByRole('dialog', { name: 'Workbook files' })).toBeVisible()
  await click('Close')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'File' })).toHaveFocus()
})

test('download uses one command and a real DOM download target', async () => {
  vi.useFakeTimers()
  const { request } = setup()
  const create = vi.fn(() => 'blob:workbook'), revoke = vi.fn()
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
  const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('Book.einfach.json')
    expect(this.href).toBe('blob:workbook')
  })
  await click('File'); await click('Download workbook')
  expect(request).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledWith('workbook.exportFile', { title: 'Book' })
  expect(create).toHaveBeenCalledOnce()
  expect(clickAnchor).toHaveBeenCalledOnce()
  expect(screen.getByRole('status')).toHaveTextContent('Download requested')
  await vi.runAllTimersAsync()
  expect(revoke).toHaveBeenCalledWith('blob:workbook')
})

test('download failures remain in the dialog and permit retry', async () => {
  const { request } = setup()
  request.mockRejectedValueOnce(new Error('Snapshot unavailable'))
  await click('File'); await click('Download workbook')
  expect(screen.getByRole('alert')).toHaveTextContent('Snapshot unavailable')
  expect(screen.getByRole('button', { name: 'Download workbook' })).toBeEnabled()
})

test('declining New and Open neither reads a file nor requests Rust', async () => {
  const { request } = setup()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('File'); await click('New blank workbook')
  const read = vi.fn(async () => '{}')
  await act(async () => {
 fireEvent.change(screen.getByLabelText('Open workbook'), {
    target: { files: [{ name: 'Book.einfach.json', size: 2, text: read }] },
  })
})
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(request).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
})

test('file read error keeps the current book and allows selecting the same file again', async () => {
  const { request } = setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const read = vi.fn(async () => { throw new Error('Cannot read file') })
  await click('File')
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => {
 fireEvent.change(screen.getByLabelText('Open workbook'), {
      target: { files: [{ name: 'Book.einfach.json', size: 2, text: read }] },
    })
})
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read file')
  }
  expect(read).toHaveBeenCalledTimes(2)
  expect(request).not.toHaveBeenCalled()
  expect(screen.getByText('Book')).toBeVisible()
})

test('File stays disabled while a cell draft is being edited', () => {
  const { store } = setup()
  act(() => {
 store.setter(startEditingAtom, {
    sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: 'Keep draft',
  })
})
  expect(screen.getByRole('button', { name: 'File' })).toBeDisabled()
})
