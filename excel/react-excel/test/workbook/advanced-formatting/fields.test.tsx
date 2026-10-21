import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type RustWorkbookConnection, type RustWorkbookCommands } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { AdvancedFormattingFields } from '../../../src/workbook/advanced-formatting/AdvancedFormattingFields'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 } })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], conditionalFormats: { revision: 0, rules: [] } } })
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 1, rules: [] },
  } }))
  render(<WorkbookStoreProvider store={store} connection={{ request: request as RustWorkbookConnection['request'], dispose() {} }}>
    <AdvancedFormattingFields idPrefix="advanced" />
  </WorkbookStoreProvider>)
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    act(async () => { await store.setter(runNativeConditionalFormatAtom, action) })
  return { store, request, run }
}

test('wildcard fields keep Unicode and escapes in the native draft and save once', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'text' })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Text condition'), { target: { value: 'matches-wildcard' } })
    fireEvent.change(screen.getByLabelText('Matching text'), { target: { value: '中文?~*' } })
  })
  expect(screen.getByText(/Matches the whole text/)).toBeVisible()
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ condition: 'matches-wildcard', text: '中文?~*' })
  expect(request).not.toHaveBeenCalled()
  await run('save')
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ rule: { condition: 'matches-wildcard', text: '中文?~*' } })
})

test('literal mode keeps its original help and negative wildcard changes only its draft', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'text' })
  expect(screen.getByText(/ordinary characters/)).toBeVisible()
  await act(async () => { fireEvent.change(screen.getByLabelText('Text condition'), { target: { value: 'not-matches-wildcard' } }) })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ condition: 'not-matches-wildcard' })
  await run('close'); expect(request).not.toHaveBeenCalled()
})

test('duplicate comparison defaults to original values and display-text unique mode uses the same command', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'duplicate-values' })
  expect(screen.getByLabelText('Compare by')).toHaveValue('value')
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Compare by'), { target: { value: 'display-text' } })
    fireEvent.change(screen.getByLabelText('Highlight values'), { target: { value: 'unique' } })
  })
  expect(screen.getByText(/conditional formatting is excluded/)).toBeVisible()
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ mode: 'unique', compareBy: 'display-text' })
  await run('save')
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ rule: { mode: 'unique', compareBy: 'display-text' } })
})
