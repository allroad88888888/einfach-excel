import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, nativeConditionalFormatPanelAtom, nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type NativeConditionalFormatRule } from '../../src'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
const range = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 }
function setup(rule: NativeConditionalFormatRule = { kind: 'icon-set', iconSet: 'three-arrows' }) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const entry = { id: 'native-icon', scope: { range }, priority: 0, rule }
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 2, rules: [entry] },
  } }))
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'], dispose() {} })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's', window: range, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: { ...read.request, cells: [],
    conditionalFormats: { revision: 1, rules: [entry] } } })
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    store.setter(runNativeConditionalFormatAtom, action)
  return { store, run, request, entry }
}

test('icons and threshold drafts submit one existing conditionalFormat.change request', async () => {
  const { run, request } = setup()
  await run('open'); await run({ type: 'kind', kind: 'icon-set' })
  await run({ type: 'draft', range: 'A1:A3', rule: { iconSet: 'three-flags', reverse: true, showValue: false,
    lowerThreshold: { type: 'percentile', value: '25' }, upperThreshold: { type: 'formula', value: '=$Z$1' } } })
  expect(request).not.toHaveBeenCalled()
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0]).toMatchObject(['conditionalFormat.change', { action: 'set', rule: {
    kind: 'icon-set', iconSet: 'three-flags', reverse: true, showValue: false,
    lowerThreshold: { type: 'percentile', value: '25' }, upperThreshold: { type: 'formula', value: '=$Z$1' },
  } }])
})

test('editing native icons keeps the ID; cancelling never mutates returned thresholds', async () => {
  const { run, request, entry, store } = setup({ kind: 'icon-set', iconSet: 'three-arrows',
    lowerThreshold: { type: 'number', value: '3' } })
  await run('open'); await run({ type: 'edit', id: entry.id })
  await run({ type: 'draft', rule: { lowerThreshold: { type: 'number', value: '9' } } })
  expect(store.getter(nativeConditionalFormatsAtom)?.rules[0].rule).toEqual(entry.rule)
  await run('close'); expect(request).not.toHaveBeenCalled()
  await run('open'); await run({ type: 'edit', id: entry.id }); await run('save')
  expect(request.mock.calls[0][1]).toMatchObject({ ruleId: entry.id, rule: entry.rule })
})

test('native threshold rejection keeps correctable drafts and successful reply publishes only once', async () => {
  const { run, request, store } = setup()
  await run('open'); await run({ type: 'kind', kind: 'color-scale' })
  await run({ type: 'draft', range: 'A1:A3', rule: { maxThreshold: { type: 'percent', value: '101' } } })
  request.mockRejectedValueOnce(new Error('Threshold percentages must be between 0 and 100.'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom)).toMatchObject({ busy: false,
    error: 'Threshold percentages must be between 0 and 100.', rule: { maxThreshold: { value: '101' } } })
  await run({ type: 'draft', rule: { maxThreshold: { type: 'percent', value: '80' } } })
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledTimes(2)
})

test('switching visual kinds discards incompatible thresholds and icon state', async () => {
  const { run, store } = setup()
  await run('open'); await run({ type: 'kind', kind: 'icon-set' })
  await run({ type: 'draft', rule: { reverse: true, lowerThreshold: { type: 'number', value: '7' } } })
  await run({ type: 'kind', kind: 'data-bar' })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toEqual({ kind: 'data-bar', minColor: '#f8696b', maxColor: '#638ec6' })
})

test('a busy icon save blocks duplicate submission and preserves its native draft until the reply', async () => {
  const { run, request, store } = setup()
  let complete!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  await run('open'); await run({ type: 'kind', kind: 'icon-set' })
  const pending = run('save')
  expect(store.getter(nativeConditionalFormatPanelAtom).busy).toBe(true)
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  expect(await run({ type: 'draft', rule: { reverse: true } })).toBe(false)
  expect(request).toHaveBeenCalledOnce()
  complete({ projection: { ...request.mock.calls[0][1].projection, cells: [],
    conditionalFormats: { revision: 2, rules: [] } } })
  expect(await pending).toBe(true)
  expect(store.getter(nativeConditionalFormatPanelAtom).sheetId).toBeNull()
})
