import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { DataValidationTools } from '../../../src/workbook/chrome/ribbon/DataValidationTools'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected visible projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 1 } })
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'validation.read') return null
    const input = payload as RustWorkbookCommands['validation.change']['payload']
    return { projection: { ...input.projection, cells: [], revision: 2 } }
  })
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><DataValidationTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function change(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}

test('opens with focus; cancel restores trigger without native write', async () => {
  const request = setup()
  await click('Data validation')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByLabelText('Applies to')).toHaveFocus()
  await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Data validation' })).toHaveFocus()
  expect(request).toHaveBeenCalledWith('validation.read', { sheetId: 's', row: 0, col: 0 })
  expect(request).toHaveBeenCalledTimes(1)
})

test.each(['whole-number', 'decimal', 'list', 'date', 'time', 'text-length'])('submits %s through one command', async (kind) => {
  const request = setup()
  await click('Data validation'); await change('Allow', kind)
  if (kind === 'list') {
    expect(screen.queryByLabelText('Minimum')).toBeNull()
    await change('Items, one per line', 'Ready\nOn hold')
  } else if (kind === 'date' || kind === 'time') {
    const [min, max] = kind === 'date' ? ['2026-10-01', '2026-10-31'] : ['09:00', '17:00']
    expect(screen.getByLabelText('Minimum')).toHaveAttribute('type', 'text')
    await change('Minimum', min); await change('Maximum', max)
  } else {
    await change('Minimum', '1'); await change('Maximum', '9')
  }
  await click('Apply')
  expect(request.mock.calls[1]).toMatchObject(['validation.change', { rule: { kind } }])
  if (kind === 'date' || kind === 'time') expect(request.mock.calls[1]).toMatchObject([
    'validation.change', { rule: { min: kind === 'date' ? '2026-10-01' : '09:00',
      max: kind === 'date' ? '2026-10-31' : '17:00' } },
  ])
  expect(request).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('native error keeps editable form; clear does not submit numeric drafts', async () => {
  const request = setup()
  await click('Data validation')
  request.mockRejectedValueOnce(new Error('Minimum exceeds maximum'))
  await change('Minimum', '200'); await click('Apply')
  expect(screen.getByRole('alert')).toHaveTextContent('Minimum exceeds maximum')
  expect(screen.getByLabelText('Minimum')).toHaveValue(200)
  await click('Clear validation')
  expect(request.mock.calls[2]).toMatchObject(['validation.change', { rule: null }])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test.each(['equal', 'not-equal', 'greater-than', 'greater-than-or-equal', 'less-than',
  'less-than-or-equal'])('%s hides the second bound and sends one cutoff', async (operator) => {
  const request = setup()
  await click('Data validation'); await change('Condition', operator)
  expect(screen.queryByLabelText('Maximum')).toBeNull()
  expect(screen.queryByLabelText('Minimum')).toBeNull()
  await change('Value', '7'); await click('Apply')
  expect(request.mock.calls[1]).toMatchObject(['validation.change', {
    rule: { min: 7, max: 7, operator },
  }])
  expect(request).toHaveBeenCalledTimes(2)
})

test('outside range shows two boundaries and list hides comparison controls', async () => {
  setup(); await click('Data validation'); await change('Condition', 'not-between')
  expect(screen.getByLabelText('Minimum')).toBeVisible()
  expect(screen.getByLabelText('Maximum')).toBeVisible()
  expect(screen.getByText(/Both boundaries are excluded/)).toBeVisible()
  await change('Allow', 'list')
  expect(screen.queryByLabelText('Condition')).toBeNull()
  expect(screen.queryByText(/Both boundaries are excluded/)).toBeNull()
})
