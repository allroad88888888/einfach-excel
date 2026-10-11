import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection,
  type NativeTable, type NativeTotalFunction } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { TableTools } from '../../../src/workbook/chrome/ribbon/TableTools'

function setup(empty = false, totals?: readonly (NativeTotalFunction | null)[]) {
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
        hasHeaders: true, hasTotals: Boolean(totals), columns: ['Product', 'Amount'], totalFunctions: totals ?? [] },
    ],
  } })
  const request = vi.fn(async (_: string, payload: unknown) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true,
      projection: { ...input.projection, cells: [], revision: 2, tables: [] as NativeTable[] } }
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
  expect(screen.getByRole('button', { name: 'Show totals row' })).toBeDisabled()
  const input = request.mock.calls[0][1] as RustWorkbookCommands['table.change']['payload']
  await act(async () => finish({ changed: true,
    projection: { ...input.projection, cells: [], revision: 2, tables: [] } }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test.each([false, true])('totals toggle (enabled=%s) dispatches the existing command atom', async (enabled) => {
  const request = setup(false, enabled ? ['none', 'sum'] : undefined)
  await click('Tables'); await click('Edit table Sales')
  await click(enabled ? 'Hide totals row' : 'Show totals row')
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['table.change', {
    action: { kind: 'totals-row', name: 'Sales', enabled: !enabled },
  }])
})

test('column choice reads native function state and Apply returns the saved function', async () => {
  const request = setup(false, ['none', 'sum'])
  request.mockImplementationOnce(async (_, payload) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2, tables: [
      { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4',
        hasHeaders: true, hasTotals: true, columns: ['Product', 'Amount'], totalFunctions: ['count', 'sum'] },
    ] } }
  })
  await click('Tables'); await click('Edit table Sales')
  expect(screen.getByLabelText('Total function')).toHaveValue('sum')
  await change('Total column', 'Product')
  expect(screen.getByLabelText('Total function')).toHaveValue('none')
  await change('Total function', 'count'); await click('Apply total')
  expect(request.mock.calls[0]).toMatchObject(['table.change', {
    action: { kind: 'total-function', name: 'Sales', column: 'Product', function: 'count' },
  }])
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByLabelText('Total function')).toHaveValue('count')
})

test('custom contents are shown honestly and failure preserves a correctable total draft', async () => {
  const request = setup(false, ['none', null])
  await click('Tables'); await click('Edit table Sales')
  expect(screen.getByLabelText('Total function')).toHaveValue('custom')
  expect(screen.getByRole('button', { name: 'Apply total' })).toBeDisabled()
  await change('Total function', 'average')
  request.mockRejectedValueOnce(new Error('Totals row blocked'))
  await click('Apply total')
  expect(screen.getByRole('alert')).toHaveTextContent('Totals row blocked')
  expect(screen.getByLabelText('Total function')).toHaveValue('average')
  expect(screen.getByRole('button', { name: 'Apply total' })).toBeEnabled()
})

test('column rename keeps a correctable draft and submits only the selected original column', async () => {
  const request = setup()
  await click('Tables'); await click('Edit table Sales'); await change('Column', 'Amount')
  expect(screen.getByLabelText('New column name')).toHaveValue('Amount')
  await change('New column name', 'Product')
  request.mockRejectedValueOnce(new Error('Duplicate column name'))
  await click('Rename column')
  expect(screen.getByRole('alert')).toHaveTextContent('Duplicate column name')
  expect(screen.getByLabelText('Column')).toHaveValue('Amount')
  expect(screen.getByLabelText('New column name')).toHaveValue('Product')
  await change('New column name', 'Net [tax]'); await click('Rename column')
  expect(request.mock.calls[1]).toMatchObject(['table.change', { action: {
    kind: 'rename-column', name: 'Sales', column: 'Amount', newName: 'Net [tax]',
  } }])
})
