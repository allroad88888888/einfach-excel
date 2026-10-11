import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { TableTools } from '../../../src/workbook/chrome/ribbon/TableTools'

function setup(empty = false) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: {
    ...read.request, cells: [], revision: 1, tables: empty ? [] : [
      { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4',
        hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount'] },
    ],
  } })
  const request = vi.fn(async (_: string, payload: unknown) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true,
      projection: { ...input.projection, cells: [], revision: 2, tables: [] } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><TableTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}
test('empty table dialog focuses its field and cancel restores focus without writes', async () => {
  const request = setup(true)
  await click('Tables')
  expect(screen.getByLabelText('Table name')).toHaveFocus()
  expect(screen.getByText(/No tables yet/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Convert to range' })).toBeDisabled()
  await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Tables' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})
test('create submits field atoms through one semantic command', async () => {
  const request = setup(true)
  await click('Tables'); await change('Table name', 'Sales'); await change('Table range', 'A1:B4')
  await click('Create table')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['table.change', { action: {
    kind: 'create', name: 'Sales', range: { rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 },
  } }])
  expect(screen.queryByRole('dialog')).toBeNull()
})
test.each(['Rename table', 'Convert to range'])('%s uses the original table identity', async (button) => {
  const request = setup()
  await click('Tables'); await click('Edit table Sales')
  expect(screen.getByLabelText('Table range')).toHaveAttribute('readonly')
  await change('Table name', 'Revenue'); await click(button)
  expect(request.mock.calls[0]).toMatchObject(['table.change', { action: button === 'Rename table'
    ? { kind: 'rename', name: 'Sales', newName: 'Revenue' }
    : { kind: 'convert-to-range', name: 'Sales' } }])
})
test('native conflict preserves editable draft and New table resets it', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('Table name already exists'))
  await click('Tables'); await click('Edit table Sales'); await change('Table name', 'Other')
  await click('Rename table')
  expect(screen.getByRole('alert')).toHaveTextContent('already exists')
  expect(screen.getByLabelText('Table name')).toHaveValue('Other')
  await click('New table')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Table name')).toHaveValue('')
})
test('pending command disables fields until the returned projection closes the dialog', async () => {
  const request = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await click('Tables'); await click('Edit table Sales'); await click('Convert to range')
  expect(screen.getByRole('status')).toHaveTextContent('Saving table changes')
  expect(screen.getByLabelText('Table name')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  const input = request.mock.calls[0][1] as RustWorkbookCommands['table.change']['payload']
  await act(async () => finish({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2, tables: [] } }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
