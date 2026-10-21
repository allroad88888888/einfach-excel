import { createStore } from '@einfach/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type RustWorkbookConnection, type RustWorkbookCommands } from '@einfach/spreadsheet-ui-core'
import { WorkbookStoreProvider } from '../../../src/page/WorkbookStoreProvider'
import { AdvancedConditionalFormatFields } from '../../../src/workbook/advanced-conditional-format/AdvancedConditionalFormatFields'

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
    <AdvancedConditionalFormatFields idPrefix="advanced" />
  </WorkbookStoreProvider>)
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    act(async () => { await store.setter(runNativeConditionalFormatAtom, action) })
  return { store, request, run }
}

test('threshold controls write drafts and leave evaluation to the single native save', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'color-scale' })
  await act(async () => { fireEvent.change(screen.getByLabelText('Maximum threshold type'), { target: { value: 'formula' } }) })
  await act(async () => { fireEvent.change(screen.getByLabelText('Maximum threshold value'), { target: { value: '=$Z$1' } }) })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ maxThreshold: { type: 'formula', value: '=$Z$1' } })
  expect(request).not.toHaveBeenCalled()
  await run('save')
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ rule: { maxThreshold: { type: 'formula', value: '=$Z$1' } } })
})

test('icon style, reverse, icon-only and percentile controls dispatch native draft atoms', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'icon-set' })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Icon style'), { target: { value: 'three-flags' } })
    fireEvent.click(screen.getByLabelText('Reverse icon order'))
    fireEvent.click(screen.getByLabelText('Show icon only'))
    fireEvent.change(screen.getByLabelText('Lower icon threshold type'), { target: { value: 'percentile' } })
  })
  await act(async () => { fireEvent.change(screen.getByLabelText('Lower icon threshold value'), { target: { value: '25' } }) })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ kind: 'icon-set', iconSet: 'three-flags',
    reverse: true, showValue: false, lowerThreshold: { type: 'percentile', value: '25' } })
  await run('close'); expect(request).not.toHaveBeenCalled()
})

test('automatic threshold removes its value; switching kinds does not expose stale controls', async () => {
  const { store, run } = setup()
  await run('open'); await run({ type: 'kind', kind: 'color-scale' })
  await act(async () => { fireEvent.change(screen.getByLabelText('Minimum threshold type'), { target: { value: 'number' } }) })
  expect(screen.getByLabelText('Minimum threshold value')).toBeVisible()
  await act(async () => { fireEvent.change(screen.getByLabelText('Minimum threshold type'), { target: { value: 'auto' } }) })
  expect(screen.queryByLabelText('Minimum threshold value')).toBeNull()
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({
    minThreshold: undefined,
  })
  await run({ type: 'kind', kind: 'cell-value' })
  expect(screen.queryByLabelText('Minimum threshold type')).toBeNull()
})
