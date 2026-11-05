import { createStore } from '@einfach/core'
import { initializeWorkbookDocumentAtom, beginProjectionAtom, resolveProjectionAtom,
  setSelectionAtom, type RustWorkbookCommands, type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { AlternatingColorsTools } from '../../../src/workbook/chrome/ribbon/AlternatingColorsTools'
import { ConditionalFormatTools } from '../../../src/workbook/chrome/ribbon/ConditionalFormatTools'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 3, col: 1 }, focus: { row: 6, col: 2 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: {
    ...read.request, cells: [], conditionalFormats: { revision: 1, rules: [] },
  } })
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 2, rules: [] },
  } }))
  render(<WorkbookStoreProvider store={store} connection={{
    request: request as RustWorkbookConnection['request'], dispose() {},
  }}><AlternatingColorsTools /><ConditionalFormatTools /></WorkbookStoreProvider>)
  return request
}
async function click(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
test('opens only the banding dialog, focuses color and returns focus after cancel', async () => {
  const request = setup()
  await click('Alternating colors')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByLabelText('Band color')).toHaveFocus()
  expect(screen.getByLabelText('Applies to')).toHaveValue('B4:C7')
  expect(screen.getByRole('button', { name: 'Conditional formatting' })).toBeDisabled()
  await act(async () => { fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Alternating colors' })).toHaveFocus()
  expect(request).not.toHaveBeenCalled()
})
test('color and header controls submit through one command and errors stay editable', async () => {
  const request = setup()
  request.mockRejectedValueOnce(new Error('The rules changed.'))
  await click('Alternating colors')
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Band color'), { target: { value: '#abcdef' } })
    fireEvent.click(screen.getByLabelText('First row is a header'))
  })
  expect(request).not.toHaveBeenCalled()
  await click('Apply')
  expect(screen.getByRole('alert')).toHaveTextContent('The rules changed.')
  expect(screen.getByLabelText('First row is a header')).toBeChecked()
  await click('Apply')
  expect(request.mock.calls[1][1]).toMatchObject({ action: 'set', rule: {
    formula: '=MOD(ROW()-ROW($B$4),2)=1', format: { bgColor: '#abcdef' },
  } })
  expect(screen.queryByRole('dialog')).toBeNull()
})
