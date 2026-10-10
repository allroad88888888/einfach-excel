import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  type RustWorkbookCommands, type RustWorkbookConnection } from '@einfach/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { ConditionalFormatTools } from '../../../src/workbook/chrome/ribbon/ConditionalFormatTools'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
const range = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 }
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: range, reason: 'viewport' })
  if (read.status !== 'started' || read.request.kind !== 'visible-window')
    throw new Error('Expected a visible projection request')
  store.setter(resolveProjectionAtom, { request: read.request, result: { ...read.request, cells: [],
    conditionalFormats: { revision: 1, rules: [{ id: 'r', scope: { range }, priority: 0,
      rule: { kind: 'cell-value', operator: 'gt', value: '2', format: { bgColor: '#ffc7ce' } } }] } } })
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 2, rules: [] },
  } }))
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><ConditionalFormatTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

test('opens with focused range; Escape closes without writing and restores trigger focus', async () => {
  const request = setup()
  await click('Conditional formatting')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Applies to' })).toHaveFocus()
  expect(screen.getByRole('region', { name: 'Worksheet rules' })).toHaveTextContent('A1:A3')
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Conditional formatting' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})

test('editing an existing rule changes the same native ID and condition field', async () => {
  const request = setup()
  await click('Conditional formatting')
  await click('Edit rule 1')
  expect(screen.getByLabelText('Value', { exact: true })).toHaveValue('2')
  await act(async () => { fireEvent.change(screen.getByLabelText('Value', { exact: true }), { target: { value: '8' } }) })
  await click('Save rule')
  expect(request.mock.calls[0]).toMatchObject(['conditionalFormat.change', { action: 'set', ruleId: 'r', rule: { value: '8' } }])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('delete sends one native removal and errors keep the dialog usable', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('stale-conditional-format-revision'))
  await click('Conditional formatting')
  await click('Delete rule 1')
  expect(screen.getByRole('alert')).toHaveTextContent('stale')
  expect(screen.getByRole('button', { name: 'Delete rule 1' })).toBeEnabled()
  await click('Delete rule 1')
  expect(request.mock.calls[1][1]).toMatchObject({ action: 'remove', ruleId: 'r', revision: 1 })
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('between exposes two numeric drafts; invalid native values never close the dialog', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('Enter a finite number.'))
  await click('Conditional formatting')
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'between' } })
  })
  expect(screen.getByLabelText('Maximum')).toBeVisible()
  await click('Add rule')
  expect(screen.getByRole('alert')).toHaveTextContent('finite number')
})
