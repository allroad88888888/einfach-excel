import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  setSelectionAtom, type RustWorkbookCommands, type RustWorkbookConnection } from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { HyperlinkTools } from '../../../src/workbook/hyperlink/HyperlinkTools'
import { useGridHyperlink } from '../../../src/workbook/hyperlink/use-grid-hyperlink'
import { CellHyperlink } from '../../../../../packages/react-cells/src/hyperlink/CellHyperlink'

function Grid() {
  const link = useGridHyperlink()
  return <div role="grid" tabIndex={0} onKeyDown={link.onKeyDown} onPointerDown={link.onPointerDown}>
    <span data-cell="1:1">Customer</span>
  </div>
}
function setup(existing = false) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [{ row: 1, col: 1, displayValue: 'Customer',
      ...(existing ? { hyperlink: 'https://example.com/' } : {}) }], revision: 1 } })
  const request = vi.fn(async (_command: string, payload: unknown) => {
    const input = payload as RustWorkbookCommands['hyperlink.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2 } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><HyperlinkTools /><Grid /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('opening focuses URL; Escape/cancel restores focus without changing the workbook', async () => {
  const request = setup()
  await click('Hyperlink')
  expect(screen.getByRole('dialog', { name: 'Insert hyperlink' })).toBeVisible()
  expect(screen.getByLabelText('Link address')).toHaveFocus()
  expect(screen.getByLabelText('Display text')).toHaveValue('Customer')
  expect(screen.getByRole('button', { name: 'Remove link' })).toBeDisabled()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Hyperlink' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('save sends one command with explicitly changed display text', async () => {
  const request = setup()
  await click('Hyperlink'); await change('Link address', 'https://example.com')
  await change('Display text', 'Website'); await click('Insert link')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['hyperlink.change', {
    row: 1, col: 1, url: 'https://example.com', text: 'Website', revision: 1,
  }])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('remove bypasses invalid unsaved draft and retains existing text', async () => {
  const request = setup(true)
  await click('Hyperlink')
  expect(screen.getByRole('dialog', { name: 'Edit hyperlink' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open link in a new tab' })).toHaveAttribute('rel', 'noopener noreferrer')
  await change('Link address', 'javascript:alert(1)')
  expect(screen.queryByRole('link')).toBeNull()
  await change('Display text', 'discard'); await click('Remove link')
  expect(request.mock.calls[0]).toMatchObject(['hyperlink.change', { url: null }])
  expect(request.mock.calls[0][1]).not.toHaveProperty('text')
})

test('native failure keeps fields editable for explicit retry', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('Enter a valid http:// or https:// address.'))
  await click('Hyperlink'); await change('Link address', 'https://example.com'); await click('Insert link')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid http:// or https:// address.')
  expect(screen.getByLabelText('Link address')).toHaveValue('https://example.com')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  await click('Insert link')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(request).toHaveBeenCalledTimes(2)
})

test('Ctrl/Meta+K opens editor; only modifier primary clicks open a current cell URL', async () => {
  setup(true)
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'k', metaKey: true })
  })
  expect(screen.getByRole('dialog')).toBeVisible()
  await click('Cancel')
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  const pointer = async (props: Record<string, unknown>) => act(async () => {
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    for (const [key, value] of Object.entries({ button: 0, ...props })) {
      Object.defineProperty(event, key, { value })
    }
    fireEvent(screen.getByText('Customer'), event)
  })
  await pointer({}); await pointer({ ctrlKey: true, shiftKey: true })
  await pointer({ metaKey: true, button: 2 })
  expect(open).not.toHaveBeenCalled()
  await pointer({ metaKey: true })
  expect(open).toHaveBeenCalledExactlyOnceWith('https://example.com/', '_blank', 'noopener,noreferrer')
  open.mockRestore()
})

test('rendered links preserve explicit cell color and never navigate on ordinary clicks', () => {
  render(<CellHyperlink url="https://example.com" color="#333333">Customer</CellHyperlink>)
  const link = screen.getByRole('link')
  expect(link).toHaveStyle({ color: '#333333', textDecoration: 'underline' })
  expect(link).toHaveAttribute('tabIndex', '-1')
  expect(fireEvent.click(link)).toBe(false)
})
