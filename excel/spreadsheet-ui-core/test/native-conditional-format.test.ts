import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  beginProjectionAtom,
  resolveProjectionAtom,
  initializeWorkbookDocumentAtom,
  setSelectionAtom,
  setRustWorkbookConnectionAtom,
  nativeConditionalFormatPanelAtom,
  nativeConditionalFormatsAtom,
  runNativeConditionalFormatAtom,
  setSheetProtectionAtom,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
} from '../src'

type Payload = RustWorkbookCommands['conditionalFormat.change']['payload']
const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
const rule = {
  id: 'native-1',
  scope: { range },
  priority: 0,
  rule: {
    kind: 'cell-value' as const,
    operator: 'gt' as const,
    value: '2',
    format: { bgColor: '#ffc7ce' },
  },
}
function setup(existing = false) {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: Payload) => ({
    projection: {
      ...input.projection,
      cells: [],
      revision: 1,
      conditionalFormats: { revision: 2, rules: input.action === 'remove' ? [] : [rule] },
    },
  }))
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }],
  })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'],
    dispose() {},
  })
  store.setter(setSelectionAtom, {
    sheetId: 's',
    kind: 'range',
    anchor: { row: 1, col: 0 },
    focus: { row: 3, col: 0 },
  })
  const read = store.setter(beginProjectionAtom, {
    kind: 'visible-window',
    sheetId: 's',
    reason: 'viewport',
    window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 7 },
  })
  if (read.status !== 'started') throw new Error('Expected a projection request')
  store.setter(resolveProjectionAtom, {
    request: read.request,
    result: {
      ...read.request,
      cells: [],
      revision: 0,
      conditionalFormats: { revision: 1, rules: existing ? [rule] : [] },
    },
  })
  const run = (action: Parameters<typeof runNativeConditionalFormatAtom.write>[2]) =>
    store.setter(runNativeConditionalFormatAtom, action)
  return { store, request, run }
}

test('draft changes and cancel never send commands; new saves one request and publishes Rust rules', async () => {
  const { store, request, run } = setup()
  await run('open')
  expect(store.getter(nativeConditionalFormatPanelAtom).range).toBe('A2:A4')
  await run({ type: 'draft', rule: { value: '2' } })
  expect(request).not.toHaveBeenCalled()
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject([
    'conditionalFormat.change',
    {
      action: 'set',
      sheetId: 's',
      revision: 1,
      priority: -1,
      scope: { range },
      rule: { value: '2' },
    },
  ])
  expect(store.getter(nativeConditionalFormatsAtom)?.rules).toEqual([rule])
  expect(store.getter(nativeConditionalFormatPanelAtom).sheetId).toBeNull()
  await run('open')
  await run('close')
  expect(request).toHaveBeenCalledTimes(1)
})

test.each(['edit', 'remove'] as const)(
  '%s targets a Rust rule ID and does not make a second rules request',
  async (type) => {
    const { request, run } = setup(true)
    await run('open')
    await run({ type, id: rule.id })
    if (type === 'edit') {
      await run({ type: 'draft', rule: { value: '20' } })
      await run('save')
    }
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1]).toMatchObject({
      action: type === 'edit' ? 'set' : 'remove',
      ruleId: rule.id,
      revision: 1,
    })
  },
)

test('single cell range is allowed; out-of-canvas and protection reject before transport', async () => {
  const { store, request, run } = setup()
  await run('open')
  await run({ type: 'draft', range: 'A101' })
  expect(await run('save')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  await run({ type: 'draft', range: 'B5', rule: { value: '5' } })
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom).error).toMatch(/Unprotect/)
  store.setter(setSheetProtectionAtom, {
    sheetId: 's',
    state: { mode: 'open', unlockedRanges: [] },
  })
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[0][1]).toMatchObject({
    scope: { range: { rowStart: 4, rowEnd: 4, colStart: 1, colEnd: 1 } },
  })
})

test('native rejection preserves correctable draft and does not replace the rule directory', async () => {
  const { store, request, run } = setup(true)
  await run('open')
  await run({ type: 'draft', rule: { value: 'NaN' } })
  request.mockRejectedValueOnce(new Error('Enter a finite number.'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatsAtom)?.rules).toEqual([rule])
  expect(store.getter(nativeConditionalFormatPanelAtom)).toMatchObject({
    busy: false,
    error: 'Enter a finite number.',
    rule: { value: 'NaN' },
  })
  await run({ type: 'draft', rule: { value: '3' } })
  expect(await run('save')).toBe(true)
})

test('a malformed rules projection is rejected without replacing the displayed directory', async () => {
  const { store, request, run } = setup(true)
  request.mockImplementationOnce(async (_command, input) => ({
    projection: {
      ...input.projection,
      cells: [],
      revision: 1,
      conditionalFormats: { revision: -1, rules: [rule] },
    },
  }))
  await run('open')
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom).error).toMatch(/mismatched/)
  expect(store.getter(nativeConditionalFormatsAtom)?.revision).toBe(1)
})

test('pending save is single flight and a disconnected reply cannot publish into a new workbook', async () => {
  const { store, request, run } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await run('open')
  const pending = run('save')
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish({
    projection: {
      ...request.mock.calls[0][1].projection,
      cells: [],
      revision: 1,
      conditionalFormats: { revision: 2, rules: [rule] },
    },
  })
  expect(await pending).toBe(false)
  expect(store.getter(nativeConditionalFormatPanelAtom).sheetId).toBeNull()
})
