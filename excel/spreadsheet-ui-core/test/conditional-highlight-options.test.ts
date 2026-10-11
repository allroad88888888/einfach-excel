import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom, runNativeConditionalFormatAtom, nativeConditionalFormatPanelAtom,
  type RustWorkbookCommands, type RustWorkbookConnection } from '../src'
import { snapshotRule } from '../src/conditional-formatting/snapshot-rules'
import { freezeRule } from '../src/conditional-formatting/value-domain'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    window: { rowStart: 0, rowEnd: 10, colStart: 0, colEnd: 7 }, reason: 'viewport' })
  if (read.status !== 'started') throw new Error('Projection not started')
  store.setter(resolveProjectionAtom, { request: read.request, result: {
    ...read.request, cells: [], conditionalFormats: { revision: 0, rules: [] },
  } })
  const request = vi.fn(async (_: string, input: Payload) => ({ projection: {
    ...input.projection, cells: [], conditionalFormats: { revision: 1, rules: [] },
  } }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  type Action = Parameters<typeof runNativeConditionalFormatAtom.write>[2]
  return { store, request, run: (action: Action) =>
    store.setter(runNativeConditionalFormatAtom, action) }
}

test.each(['text', 'duplicate-values'] as const)('%s draft sends one Rust command and retains rejected input', async (kind) => {
  const { store, request, run } = setup()
  await run('open')
  await run({ type: 'kind', kind })
  await run({ type: 'draft', range: 'A1:A5, C1:C5', rule: { stopIfTrue: true,
    ...(kind === 'text' ? { text: 'Ready', condition: 'ends-with' as const } : { mode: 'unique' as const }) } })
  request.mockRejectedValueOnce(new Error('Native rejection'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom)).toMatchObject({ error: 'Native rejection',
    rule: { kind, stopIfTrue: true } })
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1][1]).toMatchObject({ action: 'set', rule: { kind, stopIfTrue: true },
    scope: { additionalRanges: [{ rowStart: 0, rowEnd: 4, colStart: 2, colEnd: 2 }] } })
  expect(request.mock.calls[1][1]).not.toHaveProperty('rule.value')
})

test('switching to a visual rule removes Stop; cancel discards all option drafts', async () => {
  const { store, request, run } = setup()
  await run('open')
  await run({ type: 'draft', rule: { stopIfTrue: true } })
  await run({ type: 'kind', kind: 'text' })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).toMatchObject({ stopIfTrue: true })
  await run({ type: 'kind', kind: 'color-scale' })
  expect(store.getter(nativeConditionalFormatPanelAtom).rule).not.toHaveProperty('stopIfTrue')
  await run('close'); await run('open')
  expect(store.getter(nativeConditionalFormatPanelAtom).rule.kind).toBe('cell-value')
  expect(request).not.toHaveBeenCalled()
})

test('rule snapshots retain the new fields and freeze nested highlights without evaluating data', () => {
  for (const rule of [
    { kind: 'text', condition: 'contains', text: 'x', stopIfTrue: true, enabled: false, format: { bold: true } },
    { kind: 'duplicate-values', mode: 'unique', stopIfTrue: true, format: { italic: true } },
  ]) {
    const snapshot = snapshotRule(rule)!
    expect(snapshot).toEqual(rule)
    expect(Object.isFrozen((freezeRule(snapshot) as { format: object }).format)).toBe(true)
    expect(snapshotRule({ ...rule, stopIfTrue: 'yes' })).toBeNull()
  }
})
