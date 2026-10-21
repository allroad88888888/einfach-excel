import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  setSelectionAtom, selectCellAtom, setRustWorkbookConnectionAtom, setSheetProtectionAtom,
  nativeDataValidationPanelAtom, runNativeDataValidationAtom, projectionSnapshotAtom,
  nativeValidationListAtom, refreshNativeValidationListAtom, chooseNativeValidationItemAtom,
  editingSessionAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type NativeDataValidationRule } from '../src'

const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
function setup(rule: NativeDataValidationRule | null = null) {
  const store = createStore()
  const request = vi.fn(async (command: string, payload: unknown): Promise<unknown> => {
    if (command === 'validation.read') return rule
    if (command === 'cell.setInput') {
      const p = payload as RustWorkbookCommands['cell.setInput']['payload']
      return { acknowledgement: { sheetId: 's', requestId: p.request.requestId, revision: 2 },
        projection: { ...p.projection, cells: [], revision: 2 } }
    }
    const p = payload as RustWorkbookCommands['validation.change']['payload']
    return { projection: { ...p.projection, cells: [], revision: 2 } }
  })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 0 }, focus: { row: 3, col: 0 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'viewport', window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 7 } })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision: 1 } })
  const run = (action: Parameters<typeof runNativeDataValidationAtom.write>[2]) =>
    store.setter(runNativeDataValidationAtom, action)
  return { store, request, run }
}

test.each(['whole-number', 'decimal', 'list', 'text-length'] as const)('%s sends native rule once', async (kind) => {
  const { store, request, run } = setup()
  await run('open')
  expect(store.getter(nativeDataValidationPanelAtom).range).toBe('A2:A4')
  expect(request).toHaveBeenCalledWith('validation.read', { sheetId: 's', row: 3, col: 0 })
  expect(request).toHaveBeenCalledTimes(1)
  await run({ kind, min: '2', max: '8', items: '001\n=1+2', ignoreBlank: false })
  expect(request).toHaveBeenCalledTimes(1)
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['validation.change', { sheetId: 's', range,
    rule: kind === 'list' ? { kind, items: ['001', '=1+2'], ignoreBlank: false }
      : { kind, min: 2, max: 8, ignoreBlank: false } }])
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(2)
  expect(store.getter(nativeDataValidationPanelAtom).sheetId).toBeNull()
})

test.each(['date', 'time'] as const)('%s preserves textual bounds and reopening the native rule', async (kind) => {
  const min = kind === 'date' ? '2026-10-01' : '09:00'
  const max = kind === 'date' ? '2026-10-31' : '17:00'
  const { store, request, run } = setup({ kind, min, max, ignoreBlank: false })
  await run('open')
  expect(store.getter(nativeDataValidationPanelAtom)).toMatchObject({ kind, min, max })
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['validation.change', {
    rule: { kind, min, max, ignoreBlank: false },
  }])
  expect(request).toHaveBeenCalledTimes(2)
})

test('changing rule type resets only draft bounds and makes no native write', async () => {
  const { store, request, run } = setup()
  await run('open')
  for (const [kind, min, max] of [['date', '1900-01-01', '9999-12-31'],
    ['time', '00:00', '23:59:59'], ['text-length', '0', '100']] as const) {
    await run({ kind })
    expect(store.getter(nativeDataValidationPanelAtom)).toMatchObject({ kind, min, max })
  }
  expect(request).toHaveBeenCalledTimes(1)
})

test.each(['equal', 'not-equal', 'greater-than', 'greater-than-or-equal', 'less-than',
  'less-than-or-equal'] as const)('%s sends only the visible cutoff once', async (operator) => {
  const { request, run } = setup()
  await run('open')
  await run({ operator, min: '3', max: 'hidden invalid draft' })
  expect(await run('save')).toBe(true)
  expect(request.mock.calls[1]).toMatchObject(['validation.change', {
    rule: { kind: 'whole-number', min: 3, max: 3, operator },
  }])
  expect(request).toHaveBeenCalledTimes(2)
})

test('outside range restores its condition, keeps both bounds, and list does not inherit it', async () => {
  const { store, request, run } = setup({ kind: 'decimal', min: 2, max: 4,
    operator: 'not-between', ignoreBlank: false })
  await run('open')
  expect(store.getter(nativeDataValidationPanelAtom).operator).toBe('not-between')
  await run('save')
  expect(request.mock.calls[1]).toMatchObject(['validation.change', {
    rule: { min: 2, max: 4, operator: 'not-between' },
  }])
  await run('open'); await run({ kind: 'list', items: 'yes\nno' }); await run('save')
  const payload = request.mock.calls[3]?.[1] as RustWorkbookCommands['validation.change']['payload']
  expect(payload.rule).toEqual({ kind: 'list', items: ['yes', 'no'], ignoreBlank: false })
})

test('existing rule fills draft; cancel is read-only; clear targets just selected range', async () => {
  const { store, request, run } = setup({ kind: 'decimal', min: 0, max: 1, ignoreBlank: false })
  await run('open')
  expect(store.getter(nativeDataValidationPanelAtom)).toMatchObject({ kind: 'decimal',
    min: '0', max: '1', ignoreBlank: false })
  await run('close')
  expect(request).toHaveBeenCalledTimes(1)
  await run('open'); await run({ range: 'A3' }); await run('clear')
  expect(request.mock.calls[2]).toMatchObject(['validation.change', { rule: null,
    range: { rowStart: 2, rowEnd: 2, colStart: 0, colEnd: 0 } }])
})

test('bounds and protection reject before write; native errors preserve the draft', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ range: 'A101' })
  expect(await run('save')).toBe(false)
  await run({ range: 'B5' })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await run('save')).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'open', unlockedRanges: [] } })
  request.mockRejectedValueOnce(new Error('Invalid data validation range'))
  await run({ min: '9', max: '2' })
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeDataValidationPanelAtom)).toMatchObject({
    busy: false, min: '9', max: '2', error: 'Invalid data validation range' })
  await run({ min: '2', max: '9' })
  expect(await run('save')).toBe(true)
  expect(request).toHaveBeenCalledTimes(3)
  expect(request.mock.lastCall).toMatchObject(['validation.change', {
    range: { rowStart: 4, rowEnd: 4, colStart: 1, colEnd: 1 },
    rule: { min: 2, max: 9 },
  }])
  expect(store.getter(nativeDataValidationPanelAtom)).toMatchObject({ sheetId: null, busy: false })
})

test.each([
  ['open', false], ['open', true], ['save', false], ['save', true],
] as const)('disconnected pending %s ignores success/error (%s)', async (action, reject) => {
  const { store, request, run } = setup()
  if (action === 'save') await run('open')
  const before = store.getter(projectionSnapshotAtom)
  let finish!: (value: unknown) => void
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((resolve, rejectRead) => {
    finish = resolve; fail = rejectRead
  }))
  const pending = run(action)
  expect(await run('close')).toBe(action === 'open')
  expect(store.getter(nativeDataValidationPanelAtom).phase)
    .toBe(action === 'open' ? null : 'saving')
  store.setter(setRustWorkbookConnectionAtom, null)
  if (reject) fail(new Error('Old worker failed'))
  else finish(null)
  expect(await pending).toBe(false)
  expect(store.getter(nativeDataValidationPanelAtom).sheetId).toBeNull()
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
})

test.each([false, true])('cancelled reading cannot revive on late completion (%s)', async (reject) => {
  const { store, request, run } = setup()
  const before = store.getter(projectionSnapshotAtom)
  let finish!: (value: unknown) => void
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((resolve, rejectRead) => {
    finish = resolve; fail = rejectRead
  }))
  const pending = run('open')
  expect(await run('close')).toBe(true)
  if (reject) fail(new Error('Cancelled read failed'))
  else finish({ kind: 'decimal', min: 1, max: 9, ignoreBlank: false })
  expect(await pending).toBe(false)
  expect(store.getter(nativeDataValidationPanelAtom))
    .toMatchObject({ sheetId: null, phase: null, error: '' })
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(request).toHaveBeenCalledTimes(1)
})

test.each(['001', '=1+2'])('list selection %s reuses one normal literal edit', async (item) => {
  const { store, request } = setup({ kind: 'list', items: [item], ignoreBlank: true })
  await store.setter(refreshNativeValidationListAtom)
  expect(await store.setter(chooseNativeValidationItemAtom, 0)).toBe('completed')
  expect(request.mock.calls[1]).toMatchObject(['cell.setInput', {
    request: { sheetId: 's', row: 3, col: 0, input: `'${item}` } }])
  expect(request).toHaveBeenCalledTimes(2)
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test('late rule response cannot replace a new target; stale selection cannot write', async () => {
  const { store, request } = setup({ kind: 'list', items: ['Ready'], ignoreBlank: true })
  await store.setter(refreshNativeValidationListAtom)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 0 } })
  expect(await store.setter(chooseNativeValidationItemAtom, 0)).toBe('blocked')
  let finish!: (value: unknown) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(refreshNativeValidationListAtom)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 0 } })
  await store.setter(refreshNativeValidationListAtom)
  finish({ kind: 'list', items: ['Stale'], ignoreBlank: true })
  await pending
  expect(store.getter(nativeValidationListAtom).rule).toMatchObject({ items: ['Ready'] })
  expect(store.getter(nativeValidationListAtom).target?.row).toBe(3)
})

test('a replacement connection invalidates the list even at the same cell and revision', async () => {
  const { store, request } = setup({ kind: 'list', items: ['Old'], ignoreBlank: true })
  await store.setter(refreshNativeValidationListAtom)
  const nextRequest = vi.fn(async () => ({ kind: 'list', items: ['New'], ignoreBlank: true }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: nextRequest as RustWorkbookConnection['request'], dispose() {},
  })
  expect(store.getter(nativeValidationListAtom)).toMatchObject({ rule: null, needsRefresh: true })
  expect(await store.setter(chooseNativeValidationItemAtom, 0)).toBe('blocked')
  expect(nextRequest).not.toHaveBeenCalled()
  await store.setter(refreshNativeValidationListAtom)
  expect(store.getter(nativeValidationListAtom)).toMatchObject({
    rule: { items: ['New'] }, needsRefresh: false,
  })
  expect(request).toHaveBeenCalledTimes(1)
  expect(nextRequest).toHaveBeenCalledTimes(1)
})

test('viewport reads retain a same-revision rule, but a native revision invalidates it', async () => {
  const { store, request } = setup({ kind: 'list', items: ['Ready'], ignoreBlank: true })
  await store.setter(refreshNativeValidationListAtom)
  const project = (revision: number) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
      reason: 'viewport', window: { rowStart: 1, rowEnd: 21, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], revision } })
  }
  project(1)
  expect(store.getter(nativeValidationListAtom)).toMatchObject({
    rule: { items: ['Ready'] }, needsRefresh: false,
  })
  project(2)
  expect(store.getter(nativeValidationListAtom)).toMatchObject({ rule: null, needsRefresh: true })
  expect(await store.setter(chooseNativeValidationItemAtom, 0)).toBe('blocked')
  expect(request).toHaveBeenCalledTimes(1)
  await store.setter(refreshNativeValidationListAtom)
  expect(store.getter(nativeValidationListAtom).needsRefresh).toBe(false)
  expect(request).toHaveBeenCalledTimes(2)
})

test('late failed read cannot erase the successful rule for the next selection', async () => {
  const { store, request } = setup({ kind: 'list', items: ['Ready'], ignoreBlank: true })
  let fail!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  const pending = store.setter(refreshNativeValidationListAtom)
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 0 } })
  await store.setter(refreshNativeValidationListAtom)
  fail(new Error('Old read failed'))
  await pending
  expect(store.getter(nativeValidationListAtom)).toMatchObject({
    target: { row: 4 }, rule: { items: ['Ready'] }, busy: false, error: '', needsRefresh: false,
  })
})
