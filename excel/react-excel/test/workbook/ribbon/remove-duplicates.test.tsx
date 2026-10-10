import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { runVisibleProjectionAtom, setSelectionAtom, setSelectionBoundsAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { RemoveDuplicatesTools } from '../../../src/workbook/chrome/ribbon/RemoveDuplicatesTools'

async function setup(removedRows = 2) {
  const result = { scannedRows: 4, removedRows, uniqueRows: 4 - removedRows, excludedRows: 1,
    headers: ['Key', 'ID'], sample: [{ row: 2, firstRow: 1, values: ['maple', 'M2'] }], sampleTruncated: true }
  const write = vi.fn(async (input: { projection: VisibleProjectionRequest }) => ({ ...result,
    projection: { ...input.projection, revision: 1, cells: [] } }))
  const preview = vi.fn(async () => ({ ...result, revision: 0 }))
  const connection: RustWorkbookConnection = { dispose: vi.fn(),
    request: vi.fn(async (command: string, input: unknown) => {
      if (command === 'duplicates.preview') return preview()
      if (command === 'duplicates.apply') return write(input as { projection: VisibleProjectionRequest })
      return { ...(input as { request: VisibleProjectionRequest }).request, revision: 0, cells: [] }
    }) as RustWorkbookConnection['request'] }
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 0, col: 0 }, focus: { row: 4, col: 1 } })
  render(<WorkbookStoreProvider store={store} connection={connection}>
    <RemoveDuplicatesTools />
  </WorkbookStoreProvider>)
  await act(async () => {
    await store.setter(runVisibleProjectionAtom, { sheetId: 's',
      window: { rowStart: 0, colStart: 0, rowEnd: 9, colEnd: 7 }, reason: 'viewport' })
  })
  await click('Remove duplicates')
  return { write, preview }
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function check(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name })) })
}

test('native counts and samples require confirmation, applying restores trigger focus', async () => {
  const { write } = await setup()
  expect(screen.getByLabelText('First row contains headers')).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('2 duplicate records; 2 unique records remain')
  expect(screen.getByRole('table', { name: 'Duplicate records to remove' })).toHaveTextContent('maple · M2')
  expect(screen.getByRole('button', { name: 'Remove records' })).toBeDisabled()
  await check(/Remove 2 duplicate/)
  await click('Remove records')
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.lastCall![0]).toMatchObject({
    expectedRevision: 0, columns: [0, 1], hasHeader: true,
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Remove duplicates' })).toHaveFocus()
})

test('header, key column and comparison edits stay drafts until explicit preview', async () => {
  const { preview, write } = await setup()
  await check('First row contains headers')
  await check('Compare column B')
  await act(async () => { fireEvent.change(screen.getByLabelText('Text comparison'), { target: { value: 'trim' } }) })
  expect(preview).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Remove records' })).toBeDisabled()
  await click('Update preview')
  await check(/Remove 2 duplicate/)
  await click('Remove records')
  expect(write.mock.lastCall![0]).toMatchObject({ columns: [0], hasHeader: false, comparison: 'trim' })
})

test('empty selection of keys is correctable with Select all and never writes on Cancel', async () => {
  const { preview, write } = await setup()
  await click('Clear all')
  await click('Update preview')
  expect(screen.getByRole('alert')).toHaveTextContent('at least one')
  expect(preview).toHaveBeenCalledTimes(1)
  await click('Select all')
  await click('Update preview')
  expect(screen.queryByRole('alert')).toBeNull()
  await click('Cancel')
  expect(write).not.toHaveBeenCalled()
})

test('Escape discards draft and confirmation; reopening uses default settings', async () => {
  await setup()
  await check(/Remove 2 duplicate/)
  await check('First row contains headers')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true })) })
  await click('Remove duplicates')
  expect(screen.getByLabelText('First row contains headers')).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /Remove 2 duplicate/ })).not.toBeChecked()
})

test('unique input displays zero results without an enabled destructive action', async () => {
  const { write } = await setup(0)
  expect(screen.getByRole('status')).toHaveTextContent('0 duplicate records')
  expect(screen.getByRole('button', { name: 'Remove records' })).toBeDisabled()
  await click('Cancel')
  expect(write).not.toHaveBeenCalled()
})
