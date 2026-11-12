import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, runNativeConditionalFormatAtom, nativeConditionalFormatPanelAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type TimePeriodRule,
  CONDITIONAL_TIME_PERIODS } from '../src'
import { snapshotRule } from '../src/conditional-formatting/snapshot-rules'
import { defaultRuleForKind, freezeRule } from '../src/conditional-formatting/value-domain'

const range = { rowStart: 0, rowEnd: 6, colStart: 0, colEnd: 2 }
const rule: TimePeriodRule = { kind: 'time-period', period: 'last7Days',
  enabled: false, stopIfTrue: true, format: { bgColor: '#ffc7ce' } }

test('every date period survives typed snapshots and frozen editor values', () => {
  for (const period of CONDITIONAL_TIME_PERIODS) {
    const input = { ...rule, period }
    expect(snapshotRule(input)).toEqual(input)
    const frozen = freezeRule(input)
    expect(frozen).toEqual(input)
    expect(Object.isFrozen(frozen)).toBe(true)
    expect('format' in frozen && Object.isFrozen(frozen.format)).toBe(true)
  }
  expect(defaultRuleForKind('time-period')).toMatchObject({ kind: 'time-period', period: 'today' })
  for (const patch of [{ period: 'lastYear' }, { period: null }, { enabled: 1 },
    { stopIfTrue: 'true' }, { value: '9' }, { format: null }])
    expect(snapshotRule({ ...rule, ...patch })).toBeNull()
})

test('editing an imported date rule preserves its type options range and single-request save', async () => {
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
  await run({ type: 'draft', rule: { period: 'thisMonth' } })
  expect(request).not.toHaveBeenCalled()
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ action: 'set', ruleId: 'date',
    scope: { range }, rule: { ...rule, period: 'thisMonth' } })
})
