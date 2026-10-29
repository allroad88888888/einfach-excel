import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  setSelectionAtom, type RustWorkbookConnection } from '@einfach-excel/spreadsheet-ui-core'
import type { RustNoteCommands } from '../../../../spreadsheet-ui-core/src/rust-workbook/notes/command'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { NoteTools } from '../../../src/workbook/notes/NoteTools'

function setup(text: string | null = null) {
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
    result: { ...read.request, cells: [], revision: 1 } })
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'notes.read') return { text, revision: 1 }
    const input = payload as RustNoteCommands['notes.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2 } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><NoteTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: exactName })) })
}
async function change(value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText('Note text'), { target: { value } }) })
}

test('open loads native multiline text and Cancel restores trigger focus without a write', async () => {
  const request = setup('first\n第二行')
  await click('Note')
  expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeVisible()
  expect(screen.getByLabelText('Note text')).toHaveValue('first\n第二行')
  expect(screen.getByLabelText('Note text')).toHaveFocus()
  await change('discard'); await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Note' })).toHaveFocus()
  expect(request).toHaveBeenCalledTimes(1)
})

test('Insert note submits a native note command without cell replacement', async () => {
  const request = setup()
  await click('Note')
  expect(screen.getByRole('button', { name: 'Delete note' })).toBeDisabled()
  await change('first\nsecond'); await click('Insert note')
  expect(request.mock.calls[1]).toMatchObject(['notes.change', { row: 1, col: 1, text: 'first\nsecond', revision: 1 }])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Note' })).toHaveFocus()
})

test('blank input reports rule; Delete note bypasses an invalid draft', async () => {
  const request = setup('existing')
  await click('Note'); await change(' \n'); await click('Save note')
  expect(screen.getByRole('alert')).toHaveTextContent('Enter note text')
  expect(request).toHaveBeenCalledTimes(1)
  await click('Delete note')
  expect(request.mock.calls[1]).toMatchObject(['notes.change', { text: null }])
})

test('Escape cancellation discards draft; failed write remains retryable', async () => {
  const request = setup()
  await click('Note'); await change('discard')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Note'); await change('retry')
  request.mockRejectedValueOnce(new Error('Native write failed.'))
  await click('Insert note')
  expect(screen.getByRole('alert')).toHaveTextContent('Native write failed.')
  expect(screen.getByLabelText('Note text')).toHaveValue('retry')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  await click('Insert note')
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('loading can be cancelled; saving disables duplicate and Escape actions', async () => {
  const request = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Note')
  expect(screen.getByRole('status')).toHaveTextContent('Loading note')
  expect(screen.getByLabelText('Note text')).toBeDisabled()
  await click('Cancel')
  await act(async () => { finish({ text: 'late', revision: 1 }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  await click('Note'); await change('pending')
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Insert note')
  expect(screen.getByRole('status')).toHaveTextContent('Saving note')
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Insert note' })).toBeDisabled()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.getByRole('dialog')).toBeVisible()
  const payload = request.mock.calls[2][1] as RustNoteCommands['notes.change']['payload']
  await act(async () => {
    finish({ changed: true, projection: { ...payload.projection, cells: [], revision: 2 } })
  })
  expect(screen.queryByRole('dialog')).toBeNull()
})
