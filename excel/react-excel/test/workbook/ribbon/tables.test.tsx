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
test('add data row keeps the table panel open with the native range and reports failure', async () => {
  const request = setup()
  request.mockImplementationOnce(async (_, payload) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2, tables: [
      { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B5',
        hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount'] },
    ] } }
  })
  await click('Tables'); await click('Edit table Sales'); await click('Add data row')
  expect(request.mock.calls[0]).toMatchObject(['table.change', { action: { kind: 'append-row', name: 'Sales' } }])
  expect(screen.getByLabelText('Table range', { exact: true })).toHaveValue('A1:B5')
  expect(screen.getByRole('dialog')).toBeVisible()
  request.mockRejectedValueOnce(new Error('No space for another row'))
  await click('Add data row')
  expect(screen.getByRole('alert')).toHaveTextContent('No space for another row')
  expect(screen.getByRole('button', { name: 'Add data row' })).toBeEnabled()
  expect(screen.getByLabelText('Table range', { exact: true })).toHaveValue('A1:B5')
})

test('appearance controls read the returned style, retain the dialog and recover from errors', async () => {
  const request = setup()
  request.mockImplementation(async (_, payload) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2, tables: [
      { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B4', hasHeaders: true,
        hasTotals: false, columns: ['Product', 'Amount'],
        style: input.action.kind === 'style' ? input.action.style : undefined },
    ] } }
  })
  await click('Tables'); await click('Edit table Sales')
  expect(screen.getByLabelText('Banded rows')).toBeDisabled()
  expect(screen.getByLabelText('Banded columns')).toBeDisabled()
  expect(screen.getByLabelText('Last column emphasis')).toBeDisabled()
  await change('Style preset', 'green')
  expect(screen.getByLabelText('Style preset')).toHaveValue('green')
  await act(async () => { fireEvent.click(screen.getByLabelText('Banded rows')) })
  expect(screen.getByLabelText('Banded rows')).not.toBeChecked()
  await act(async () => { fireEvent.click(screen.getByLabelText('First column emphasis')) })
  expect(screen.getByLabelText('First column emphasis')).toBeChecked()
  expect(request.mock.calls[2]).toMatchObject(['table.change', { action: { kind: 'style', name: 'Sales',
    style: { preset: 'green', bandedRows: false, firstColumn: true } } }])
  for (const [label, flag] of [['Banded columns', 'bandedColumns'],
    ['Last column emphasis', 'lastColumn']] as const) {
    expect(screen.getByLabelText(label)).not.toBeChecked()
    await act(async () => { fireEvent.click(screen.getByLabelText(label)) })
    expect(screen.getByLabelText(label)).toBeChecked()
    expect(request.mock.lastCall).toMatchObject(['table.change', { action: {
      kind: 'style', style: { [flag]: true },
    } }])
    request.mockRejectedValueOnce(new Error('Style rejected'))
    await act(async () => { fireEvent.click(screen.getByLabelText(label)) })
    expect(screen.getByLabelText(label)).toBeChecked()
    expect(screen.getByRole('alert')).toHaveTextContent('Style rejected')
  }
  request.mockRejectedValueOnce(new Error('Style rejected'))
  await change('Style preset', 'gray')
  expect(screen.getByRole('alert')).toHaveTextContent('Style rejected')
  expect(screen.getByLabelText('Style preset')).toHaveValue('green')
  expect(screen.getByLabelText('Style preset')).toBeEnabled()
})
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
  expect(screen.getByLabelText('Table range')).not.toHaveAttribute('readonly')
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
  expect(screen.getByLabelText('Header row')).toBeDisabled()
  expect(screen.getByLabelText('Banded columns')).toBeDisabled()
  expect(screen.getByLabelText('Last column emphasis')).toBeDisabled()
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

test('header toggle reads native geometry, preserves names and recovers after rejection', async () => {
  const request = setup()
  await click('Tables'); await click('Edit table Sales')
  await change('Table name', 'Unsaved')
  const option = screen.getByLabelText('Header row')
  expect(option).toBeChecked()
  expect(option).toBeEnabled() // No style preset is required for header semantics.
  request.mockRejectedValueOnce(new Error('Header change rejected'))
  await act(async () => { fireEvent.click(option) })
  expect(option).toBeChecked()
  expect(screen.getByRole('alert')).toHaveTextContent('Header change rejected')
  for (const enabled of [false, true]) {
    request.mockImplementationOnce(async (_, payload) => {
      const input = payload as RustWorkbookCommands['table.change']['payload']
      return { changed: true, projection: {
        ...input.projection, cells: [], revision: enabled ? 3 : 2,
        tables: [{ name: 'Sales', sheet: 'Sheet', sheetIndex: 0,
          range: enabled ? 'A1:B4' : 'A2:B4',
          hasHeaders: enabled, hasTotals: false, columns: ['Product', 'Amount'] }] } }
    })
    await act(async () => { fireEvent.click(option) })
    expect(request.mock.lastCall).toMatchObject(['table.change', {
      action: { kind: 'header-row', name: 'Sales', enabled },
    }])
    expect((option as HTMLInputElement).checked).toBe(enabled)
    expect(screen.getByLabelText('Table range')).toHaveValue(enabled ? 'A1:B4' : 'A2:B4')
    expect(screen.getByLabelText('Table name')).toHaveValue('Unsaved')
    expect(screen.queryByRole('alert')).toBeNull()
  }
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

test('resize uses the range draft, retains focus and updates the displayed native range', async () => {
  const request = setup()
  await click('Tables'); await click('Edit table Sales'); await change('Table name', 'Unsaved')
  await change('Table range', 'A1:C6')
  request.mockRejectedValueOnce(new Error('The resized range overlaps another table.'))
  await click('Resize table')
  expect(screen.getByRole('alert')).toHaveTextContent('overlaps another table')
  expect(screen.getByLabelText('Table range')).toHaveValue('A1:C6')
  request.mockImplementationOnce(async (_, payload) => {
    const input = payload as RustWorkbookCommands['table.change']['payload']
    return { changed: true, projection: { ...input.projection, cells: [], revision: 2, tables: [
      { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:C6',
        hasHeaders: true, hasTotals: false, columns: ['Product', 'Amount', 'Column1'] },
    ] } }
  })
  screen.getByRole('button', { name: 'Resize table' }).focus()
  await click('Resize table')
  expect(request.mock.calls[1]).toMatchObject(['table.change', { action: {
    kind: 'resize', name: 'Sales', range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 2 },
  } }])
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByLabelText('Table range')).toHaveValue('A1:C6')
  expect(screen.getByLabelText('Table name')).toHaveValue('Unsaved')
  expect(screen.getByRole('button', { name: 'Resize table' })).toHaveFocus()
})
