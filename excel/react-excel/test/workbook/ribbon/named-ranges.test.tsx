import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { NamedRangeTools } from '../../../src/workbook/chrome/ribbon/NamedRangeTools'

function setup(empty = false) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
    { id: 'source', index: 1, name: 'Source', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window')
    throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 1, namedRanges: empty ? [] : [
      { name: 'Sales', target: { sheet: 1, range: [1, 0, 3, 0] } },
      { name: 'Deleted', target: null },
    ], tables: empty ? [] : [{ name: 'Inventory', sheet: 'Source', sheetIndex: 1,
      range: 'A80:B84', hasHeaders: true, hasTotals: true, columns: ['Product', 'Amount'] }] } })
  const request = vi.fn(async (_command: string, payload: unknown) => {
    const input = payload as RustWorkbookCommands['namedRange.change']['payload']
    return { changed: true,
      projection: { ...input.projection, cells: [], revision: 2, namedRanges: [] } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><div className="workbook"><NamedRangeTools />
    <div data-workbook-grid="true" tabIndex={0} data-testid="grid" />
  </div></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('empty manager focuses name field and cancel returns focus without any request', async () => {
  const request = setup(true)
  await click('Name manager')
  expect(screen.getByRole('dialog', { name: 'Name manager' })).toBeVisible()
  expect(screen.getByLabelText('Name')).toHaveFocus()
  expect(screen.getByText(/No named ranges yet/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Delete name' })).toBeDisabled()
  await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Name manager' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('create sends the selected sheet and range directly through the command atom', async () => {
  const request = setup()
  await click('Name manager'); await change('Name', 'Revenue')
  await change('Worksheet', 'source'); await change('Refers to', 'C3:C6')
  await click('Create name')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['namedRange.change', { action: {
    kind: 'create', name: 'Revenue', target: { sheetId: 'source',
      range: { rowStart: 2, colStart: 2, rowEnd: 5, colEnd: 2 } },
  } }])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('editing an existing name loads its actual cross-sheet target', async () => {
  const request = setup()
  await click('Name manager'); await click('Edit Sales')
  expect(screen.getByLabelText('Worksheet')).toHaveValue('source')
  expect(screen.getByLabelText('Refers to')).toHaveValue('A2:A4')
  expect(screen.getByRole('button', { name: 'Edit Sales' })).toHaveAttribute('aria-pressed', 'true')
  await change('Name', 'Revenue'); await click('Save changes')
  expect(request.mock.calls[0]).toMatchObject(['namedRange.change', {
    action: { kind: 'update', name: 'Sales', newName: 'Revenue' },
  }])
})

test('broken names have repair instructions and deletion ignores unsaved draft fields', async () => {
  const request = setup()
  await click('Name manager'); await click('Edit Deleted')
  expect(screen.getByLabelText('Refers to')).toHaveValue('#REF!')
  expect(screen.getByText(/Enter a new range to repair/)).toBeVisible()
  await change('Name', ''); await change('Refers to', 'invalid'); await click('Delete name')
  expect(request.mock.calls[0]).toMatchObject(['namedRange.change', {
    action: { kind: 'delete', name: 'Deleted' },
  }])
})

test('native duplicate errors stay visible and New name resets the selected definition', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('Name already in use'))
  await click('Name manager'); await click('Edit Sales')
  await change('Name', 'Deleted'); await click('Save changes')
  expect(screen.getByRole('alert')).toHaveTextContent('Name already in use')
  expect(screen.getByLabelText('Name')).toHaveValue('Deleted')
  await click('New name')
  expect(screen.getByLabelText('Name')).toHaveValue('')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Create name' })).toBeVisible()
})

test('pending work disables all dialog controls until the single response is applied', async () => {
  const request = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await click('Name manager'); await click('Edit Sales'); await click('Save changes')
  expect(screen.getByRole('status')).toHaveTextContent('Saving changes')
  expect(screen.getByLabelText('Name')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  const input = request.mock.calls[0][1] as RustWorkbookCommands['namedRange.change']['payload']
  await act(async () => finish({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2, namedRanges: [] } }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})

test('Table entries show their cross-sheet target and navigate without a native mutation', async () => {
  const request = setup()
  await click('Name manager')
  expect(screen.getByRole('group', { name: 'Workbook tables' })).toHaveTextContent('Source!A80:B84')
  await click('Go to table Inventory')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(request).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByTestId('grid')).toHaveFocus())
})
