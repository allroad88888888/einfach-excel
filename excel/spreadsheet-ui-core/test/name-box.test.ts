import { expect, test } from 'vitest'
import {
  blurNameBoxAtom, commitNameBoxAtom, focusNameBoxAtom, nameBoxDisplayAtom, nameBoxStateAtom,
  parseA1Cell, parseA1Range, revertNameBoxAtom, updateNameBoxInputAtom,
  nativeNameChangeBusyAtom, nativeNamedRangesAtom, runNativeNameManagerAtom,
  selectionSnapshotAtom, setSelectionAtom, setRustWorkbookConnectionAtom,
  startEditingAtom, editingSessionAtom,
  type RustWorkbookConnection,
} from '../src'
import { names, setup } from './native-name-test-fixture'

test('A1 parsing keeps Excel bounds and normalizes reversed ranges', () => {
  expect(parseA1Cell('XFD1048576')).toEqual({ row: 1_048_575, col: 16_383 })
  for (const value of ['A0', 'XFE1', 'A1048577']) expect(parseA1Cell(value)).toBeNull()
  expect(parseA1Range('D5:B2')).toEqual({ rowStart: 1, rowEnd: 4, colStart: 1, colEnd: 3 })
})

test('display derives an exact match from native names and falls back to the range address', () => {
  const { store } = setup([{ name: 'Units', target: { sheet: 0, range: [1, 4, 3, 4] } }])
  store.setter(setSelectionAtom, { sheetId: 'orders', kind: 'range',
    anchor: { row: 1, col: 4 }, focus: { row: 3, col: 4 } })
  expect(store.getter(nameBoxDisplayAtom)).toBe('Units')
  store.setter(commitNameBoxAtom, { input: 'B2:C3' })
  expect(store.getter(nameBoxDisplayAtom)).toBe('B2:C3')
})

test('out-of-canvas addresses fail without moving selection or writing a name', () => {
  const { store, request } = setup()
  const before = store.getter(selectionSnapshotAtom)
  expect(store.setter(commitNameBoxAtom, { input: 'AA1002' })).toMatchObject({ kind: 'invalid' })
  expect(store.getter(selectionSnapshotAtom)).toEqual(before)
  expect(request).not.toHaveBeenCalled()
})

test('address navigation preserves a captured edit source; name creation still rejects editing conflicts', async () => {
  const { store, request } = setup()
  store.setter(startEditingAtom, {
    sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'formula-bar', draft: '42',
  })
  const editing = store.getter(editingSessionAtom)
  expect(store.setter(commitNameBoxAtom, { input: 'B2' })).toMatchObject({ kind: 'cell' })
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 1, col: 1 })
  expect(store.getter(editingSessionAtom)).toEqual(editing)
  expect(await store.setter(commitNameBoxAtom, { input: 'NewName' })).toMatchObject({ kind: 'invalid' })
  expect(store.getter(nameBoxStateAtom).errorMessage).toContain('Finish')
  expect(request).not.toHaveBeenCalled()
})

test('empty input is correctable without a request; Escape restores the canonical address', () => {
  const { store, request } = setup()
  const sessionId = store.setter(focusNameBoxAtom)
  expect(store.setter(commitNameBoxAtom, { input: '', sessionId })).toMatchObject({ kind: 'invalid' })
  expect(store.getter(nameBoxStateAtom)).toMatchObject({ input: '', error: true, mode: 'typing' })
  store.setter(revertNameBoxAtom, { sessionId })
  expect(store.getter(nameBoxStateAtom)).toMatchObject({ input: 'A1', error: false, mode: 'idle' })
  expect(request).not.toHaveBeenCalled()
})

test('events from an older focus session cannot replace a newer draft', () => {
  const { store } = setup()
  const old = store.setter(focusNameBoxAtom)
  const current = store.setter(focusNameBoxAtom)
  store.setter(updateNameBoxInputAtom, { sessionId: current, input: 'CurrentDraft' })
  expect(store.setter(updateNameBoxInputAtom, { sessionId: old, input: 'Stale' })).toBe(false)
  expect(store.setter(revertNameBoxAtom, { sessionId: old })).toBe(false)
  expect(store.setter(blurNameBoxAtom, { sessionId: old })).toBe(false)
  expect(store.setter(commitNameBoxAtom, { sessionId: old, input: 'Stale' }))
    .toEqual({ kind: 'invalid', reason: 'stale-session' })
  expect(store.getter(nameBoxStateAtom)).toMatchObject({
    input: 'CurrentDraft', focused: true, mode: 'typing', sessionId: current,
  })
})

test.each(['!!invalid', 'N'.repeat(256)])('Rust rejects %s and preserves the draft for retry', async (name) => {
  const { store, request } = setup()
  request.mockRejectedValueOnce(new Error('Invalid name'))
  const sessionId = store.setter(focusNameBoxAtom)
  expect(await store.setter(commitNameBoxAtom, { input: name, sessionId })).toMatchObject({ kind: 'invalid' })
  expect(request.mock.calls[0][1].action).toMatchObject({ kind: 'create', name })
  expect(store.getter(nameBoxStateAtom)).toMatchObject({
    input: name, error: true, errorMessage: 'Invalid name', mode: 'typing',
  })
  expect(store.getter(nativeNameChangeBusyAtom)).toBe(false)
  expect(await store.setter(commitNameBoxAtom, { input: 'QuickUnits', sessionId }))
    .toMatchObject({ kind: 'define-name' })
})

test.each(['Sales1', 'Sales.', 'XFE1', '销售额', 'N'.repeat(255)])(
  'new name %s uses Rust syntax authority, not the removed TS name validator', async (name) => {
    const { store, request } = setup()
    expect(await store.setter(commitNameBoxAtom, { input: name })).toMatchObject({ kind: 'define-name' })
    expect(request.mock.calls[0][1].action).toMatchObject({ kind: 'create', name })
  },
)

test('Enter/blur duplicates and manager writes share one pending command without optimistic names', async () => {
  const { store, request } = setup()
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const sessionId = store.setter(focusNameBoxAtom)
  const pending = store.setter(commitNameBoxAtom, { input: 'QuickUnits', sessionId })
  expect(store.getter(nativeNameChangeBusyAtom)).toBe(true)
  expect(store.setter(commitNameBoxAtom, { input: 'QuickUnits', sessionId }))
    .toEqual({ kind: 'invalid', reason: 'busy' })
  expect(await store.setter(runNativeNameManagerAtom, 'open')).toBe(false)
  expect(store.getter(nativeNamedRangesAtom)).toEqual(names)
  store.setter(blurNameBoxAtom, { sessionId })
  const next = store.setter(focusNameBoxAtom)
  store.setter(updateNameBoxInputAtom, { sessionId: next, input: 'CurrentDraft' })
  finish({ changed: true, projection: { ...request.mock.calls[0][1].projection,
    cells: [], revision: 8, namedRanges: [] } })
  expect(await pending).toMatchObject({ kind: 'invalid', reason: 'stale-session' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(store.getter(nativeNamedRangesAtom)).toEqual([])
  expect(store.getter(nameBoxStateAtom)).toMatchObject({
    input: 'CurrentDraft', mode: 'typing', error: false, sessionId: next,
  })
})

test('manager pending prevents a competing name-box creation', async () => {
  const { store, request } = setup()
  await store.setter(runNativeNameManagerAtom, 'open')
  await store.setter(runNativeNameManagerAtom, { name: 'ManagerName' })
  let finish!: (value: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(runNativeNameManagerAtom, 'save')
  expect(store.setter(commitNameBoxAtom, { input: 'QuickUnits' })).toMatchObject({ reason: 'busy' })
  finish({ changed: true, projection: { ...request.mock.calls[0][1].projection,
    cells: [], revision: 8, namedRanges: names } })
  expect(await pending).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
})

test('replacing the connection releases busy state and ignores late errors', async () => {
  const { store, request } = setup()
  let reject!: (error: Error) => void
  request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const pending = store.setter(commitNameBoxAtom, { input: 'OldWorkbookName' })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  const sessionId = store.setter(focusNameBoxAtom)
  store.setter(updateNameBoxInputAtom, { sessionId, input: 'NewWorkbookDraft' })
  expect(store.getter(nativeNameChangeBusyAtom)).toBe(false)
  reject(new Error('Old workbook failed'))
  expect(await pending).toMatchObject({ kind: 'invalid' })
  expect(store.getter(nameBoxStateAtom)).toMatchObject({ input: 'NewWorkbookDraft', error: false })
})
