import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom, setSelectionAtom,
  setRustWorkbookConnectionAtom, runAlternatingColorsAtom, nativeConditionalFormatPanelAtom,
  nativeConditionalFormatsAtom, setSheetProtectionAtom, type RustWorkbookConnection,
  type RustWorkbookCommands, type ConditionalFormatRuleEntry,
} from '../src'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
const range = { rowStart: 3, rowEnd: 6, colStart: 1, colEnd: 2 }
function setup(rules: ConditionalFormatRuleEntry[] = []) {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: Payload) => {
    const next = rules.filter((rule) => rule.id !== input.ruleId)
    if (input.action === 'set') next.unshift({
      id: input.ruleId!, priority: input.priority, scope: input.scope, rule: input.rule,
    })
    return { projection: { ...input.projection, cells: [], revision: 1,
      conditionalFormats: { revision: 2, rules: next } } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 3, col: 1 }, focus: { row: 6, col: 2 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'viewport', window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 7 } })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: {
    ...read.request, cells: [], revision: 0, conditionalFormats: { revision: 1, rules },
  } })
  const run = (action: Parameters<typeof runAlternatingColorsAtom.write>[2]) =>
    store.setter(runAlternatingColorsAtom, action)
  return { store, request, run }
}

test('banding is one relative-to-range native formula; drafts and cancel write nothing', async () => {
  const { store, request, run } = setup()
  await run('open')
  await run({ type: 'draft', color: '#123456' })
  expect(request).not.toHaveBeenCalled()
  await run('close')
  expect(request).not.toHaveBeenCalled()
  await run('open')
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0]).toMatchObject(['conditionalFormat.change', {
    action: 'set', revision: 1, scope: { range },
    rule: { kind: 'formula', formula: '=MOD(ROW()-ROW($B$4),2)=0', format: { bgColor: '#e8f0fe' } },
  }])
  expect(store.getter(nativeConditionalFormatPanelAtom).sheetId).toBeNull()
})

const band: ConditionalFormatRuleEntry = {
  id: 'imported-rule', priority: 3, scope: { range },
  rule: { kind: 'formula', formula: '=MOD(ROW()-ROW($B$4),2)=0', format: { bgColor: '#123456' } },
}
const unrelated: ConditionalFormatRuleEntry = {
  id: 'other', priority: -2, scope: { range },
  rule: { kind: 'formula', formula: '=TRUE', format: { bold: true } },
}
test('header option replaces the same rule, including imported rules, without touching other conditions', async () => {
  const { request, run } = setup([unrelated, band])
  await run('open')
  await run({ type: 'draft', header: true })
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ action: 'set', ruleId: 'imported-rule', priority: 3,
    rule: { formula: '=MOD(ROW()-ROW($B$4),2)=1', format: { bgColor: '#123456' } } })
})
test('remove targets only the band containing the selection and keeps the native result', async () => {
  const { store, request, run } = setup([unrelated, band])
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'cell',
    anchor: { row: 5, col: 2 }, focus: { row: 5, col: 2 } })
  await run('open')
  expect(store.getter(nativeConditionalFormatPanelAtom).range).toBe('B4:C7')
  expect(await run('remove')).toBe(true)
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0][1]).toMatchObject({ action: 'remove', ruleId: band.id, revision: 1 })
  expect(store.getter(nativeConditionalFormatsAtom)?.rules).toEqual([unrelated])
})
test('protection and native errors keep a correctable draft without optimistic colors', async () => {
  const { store, request, run } = setup()
  await run('open')
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('save')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'open', unlockedRanges: [] } })
  request.mockRejectedValueOnce(new Error('The rules changed.'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom)).toMatchObject({ busy: false, error: 'The rules changed.' })
  expect(store.getter(nativeConditionalFormatsAtom)?.rules).toEqual([])
})
test('pending apply is single flight and disconnected results cannot publish', async () => {
  const { store, request, run } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await run('open')
  const pending = run('save')
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish({ projection: { ...request.mock.calls[0][1].projection, cells: [], revision: 1,
    conditionalFormats: { revision: 2, rules: [band] } } })
  expect(await pending).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom).sheetId).toBeNull()
})

test('recognizes the parenthesized formula Rust writes after structural edits', async () => {
  const { store, request, run } = setup([{ ...band, rule: {
    kind: 'formula', formula: '=(MOD((ROW()-ROW($B$4)),2)=1)', format: { bgColor: '#123456' },
  } }])
  await run('open')
  expect(store.getter(nativeConditionalFormatPanelAtom).ruleId).toBe(band.id)
  await run({ type: 'draft', color: '#ffffff' })
  await run('save')
  expect(request.mock.calls[0][1]).toMatchObject({ ruleId: band.id,
    rule: { formula: '=MOD(ROW()-ROW($B$4),2)=1', format: { bgColor: '#ffffff' } } })
})
