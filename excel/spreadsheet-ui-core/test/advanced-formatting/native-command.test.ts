import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type NativeConditionalFormatRule } from '../../src'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
function setup(rule: NativeConditionalFormatRule = { kind: 'text', condition: 'contains', text: 'a', format: { bold: true } }) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const entry = { id: 'native-advanced', scope: { range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 } }, priority: 0, rule }
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 2, rules: [entry] },
  } }))
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's', window: entry.scope.range, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: { ...read.request, cells: [],
    conditionalFormats: { revision: 1, rules: [entry] } } })
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    store.setter(runNativeConditionalFormatAtom, action)
  return { store, run, request, entry }
}

test('wildcard drafts submit one existing native request and native rejection keeps an editable escape', async () => {
  const { run, request, store } = setup()
  await run('open'); await run({ type: 'kind', kind: 'text' })
  await run({ type: 'draft', range: 'A1:A3', rule: { condition: 'matches-wildcard', text: '中文~' } })
  request.mockRejectedValueOnce(new Error('Finish the wildcard escape with *, ? or ~.'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom)).toMatchObject({ busy: false,
    error: 'Finish the wildcard escape with *, ? or ~.', rule: { text: '中文~', condition: 'matches-wildcard' } })
  await run({ type: 'draft', rule: { text: '中文~*' } })
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['conditionalFormat.change', { action: 'set',
    rule: { kind: 'text', condition: 'matches-wildcard', text: '中文~*' } }])
  expect(request).toHaveBeenCalledTimes(2)
})

test('editing display-text unique rules preserves IDs and only saves through the existing native command', async () => {
  const { run, request, entry, store } = setup({ kind: 'duplicate-values', mode: 'unique', compareBy: 'display-text', format: { bold: true } })
  await run('open'); await run({ type: 'edit', id: entry.id })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toEqual(entry.rule)
  await run({ type: 'draft', rule: { compareBy: 'value' } })
  expect(store.getter(nativeConditionalFormatsAtom)?.rules[0].rule).toEqual(entry.rule)
  await run('close'); expect(request).not.toHaveBeenCalled()
  await run('open'); await run({ type: 'edit', id: entry.id }); await run('save')
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ ruleId: entry.id, rule: entry.rule })
})
