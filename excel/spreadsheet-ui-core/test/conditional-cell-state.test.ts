import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, runNativeConditionalFormatAtom, nativeConditionalFormatPanelAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type CellStateRule } from '../src'
import { snapshotRule } from '../src/conditional-formatting/snapshot-rules'
import { defaultRuleForKind, freezeRule } from '../src/conditional-formatting/value-domain'

const range = { rowStart: 0, rowEnd: 6, colStart: 0, colEnd: 2 }
const rule: CellStateRule = { kind: 'cell-state', condition: 'not-error',
  enabled: false, stopIfTrue: true, format: { bgColor: '#ffc7ce' } }

test('state snapshots validate four conditions and reject unrelated fields', () => {
  for (const condition of ['blank', 'not-blank', 'error', 'not-error'] as const) {
    const input = { ...rule, condition }
    expect(snapshotRule(input)).toEqual(input)
    const frozen = freezeRule(input)
    expect(frozen).toEqual(input)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect('format' in frozen && Object.isFrozen(frozen.format)).toBe(true)
  }
  expect(defaultRuleForKind('cell-state')).toMatchObject({ kind: 'cell-state', condition: 'blank' })
  for (const patch of [{ condition: 'contains' }, { condition: null }, { enabled: 1 },
    { text: 'x' }, { value: '9' }, { format: null }])
    expect(snapshotRule({ ...rule, ...patch })).toBeNull()
})

test('editing imported state rules keeps the condition distinct from text matching', async () => {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Dates', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
  const entry = { id: 'date', scope: { range }, priority: 2, rule }
  const request = vi.fn(async (_command: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 2, rules: [entry] },
  } }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'viewport', window: range })
  if (read.status !== 'started') throw new Error('Missing initial projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: {
    ...read.request, cells: [], conditionalFormats: { revision: 1, rules: [entry] },
  } })
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    store.setter(runNativeConditionalFormatAtom, action)
  await run('open')
  await run({ type: 'edit', id: 'date' })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toEqual(rule)
  await run({ type: 'cell-state-condition', condition: 'blank' })
  expect(request).not.toHaveBeenCalled()
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ action: 'set', ruleId: 'date',
    scope: { range }, rule: { ...rule, condition: 'blank' } })
})
