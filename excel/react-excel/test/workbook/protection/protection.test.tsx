import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  setSelectionAtom, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import type { RustProtectionCommands } from '../../../../spreadsheet-ui-core/src/rust-workbook/protection/commands'
import type { SheetProtectionState } from '../../../../spreadsheet-ui-core/src/protection/types'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { ProtectionTools } from '../../../src/workbook/protection/ProtectionTools'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 1 } })
  let protection: SheetProtectionState = { mode: 'open', unlockedRanges: [] }
  let revision = 1
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'protection.read') return protection
    const input = payload as RustProtectionCommands['protection.change']['payload']
    const change = input.change
    if (change.action === 'protect') protection = { ...protection, mode: 'protected' }
    if (change.action === 'unprotect') protection = { ...protection, mode: 'open' }
    if (change.action === 'allow-range') protection = { ...protection,
      unlockedRanges: [...protection.unlockedRanges, change.range] }
    return { changed: true, protection,
      projection: { ...input.projection, cells: [], revision: ++revision } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><ProtectionTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  const exactName = new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: exactName })) })
}

test('dialog reads native state, focuses close and cancels without writing or asking for a password', async () => {
  const request = setup()
  await click('Worksheet protection')
  const dialog = screen.getByRole('dialog', { name: 'Worksheet protection' })
  expect(dialog).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  expect(dialog).toHaveTextContent('does not encrypt')
  expect(screen.queryByLabelText(/password/i)).toBeNull()
  expect(screen.getByRole('button', { name: 'Allow editing in selection B2:C3' })).toBeEnabled()
  await act(async () => { fireEvent(dialog, new Event('cancel', { cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Worksheet protection' })).toHaveFocus()
  expect(request).toHaveBeenCalledExactlyOnceWith('protection.read', { sheetId: 's' })
})

test('allow range and protect render native responses and disable configuration until unprotected', async () => {
  const request = setup()
  await click('Worksheet protection')
  await click('Allow editing in selection B2:C3')
  expect(screen.getByRole('button', { name: 'Remove editable range B2:C3' })).toBeEnabled()
  await click('Protect worksheet')
  expect(screen.getByText('This worksheet is protected.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Remove editable range B2:C3' })).toBeDisabled()
  await click('Unprotect worksheet')
  expect(screen.getByRole('button', { name: 'Remove editable range B2:C3' })).toBeEnabled()
  expect(request.mock.calls.filter(([name]) => name === 'protection.change')).toHaveLength(3)
})

test('native failures remain visible and retryable without false success', async () => {
  const request = setup()
  await click('Worksheet protection')
  request.mockRejectedValueOnce(new Error('Native protection failed.'))
  await click('Protect worksheet')
  expect(screen.getByRole('alert')).toHaveTextContent('Native protection failed.')
  expect(screen.getByRole('button', { name: 'Protect worksheet' })).toBeEnabled()
  await click('Protect worksheet')
  expect(screen.getByRole('button', { name: 'Unprotect worksheet' })).toBeEnabled()
})

test('saving shows a status and disables duplicate commands until the native reply', async () => {
  const request = setup()
  await click('Worksheet protection')
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  await click('Protect worksheet')
  expect(screen.getByRole('button', { name: 'Protect worksheet' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(screen.getByText('Saving worksheet protection…')).toBeVisible()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(request).toHaveBeenCalledTimes(2)
  await act(async () => { fail(new Error('Native protection failed.')) })
  expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
})

test('a deferred native read displays loading and remains cancellable without a stale result', async () => {
  const request = setup()
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await click('Worksheet protection')
  expect(screen.getByText('Reading worksheet protection…')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Protect worksheet' })).toBeDisabled()
  await click('Close')
  await act(async () => { finish({ mode: 'protected', unlockedRanges: [] }) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Worksheet protection' })).toHaveFocus()
})
