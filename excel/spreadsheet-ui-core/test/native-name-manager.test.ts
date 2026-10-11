import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  beginProjectionAtom, resolveProjectionAtom, initializeWorkbookDocumentAtom,
  clearWorkbookDocumentAtom, setSelectionAtom, setRustWorkbookConnectionAtom,
  setSheetProtectionAtom, nativeNamedRangesAtom, nativeNameManagerAtom, nativeNameManagerOpenAtom,
  runNativeNameManagerAtom, projectionSnapshotAtom,
  type NativeNamedRange, type RustWorkbookCommands, type RustWorkbookConnection,
} from '../src'

const names: readonly NativeNamedRange[] = [
  { name: 'Sales', target: { sheet: 1, range: [1, 0, 3, 0] } },
  { name: 'Deleted', target: null },
]
type Input = RustWorkbookCommands['namedRange.change']['payload']
function setup() {
  const store = createStore()
  const request = vi.fn(async (_command: string, input: Input) => ({
    changed: true,
    projection: { ...input.projection, cells: [], revision: 2, namedRanges: names },
  }))
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 'view', index: 0, name: 'View', rowCount: 100, colCount: 8 },
    { id: 'source', index: 1, name: 'Source', rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(setSelectionAtom, { sheetId: 'view', kind: 'range',
    anchor: { row: 1, col: 0 }, focus: { row: 3, col: 0 } })
  const project = (revision = 1, catalog: readonly NativeNamedRange[] = names) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 'view',
      reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
    if (read.status !== 'started' || read.request.kind !== 'visible-window')
      throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], revision, namedRanges: catalog } })
  }
  project()
  const run = (action: Parameters<typeof runNativeNameManagerAtom.write>[2]) =>
    store.setter(runNativeNameManagerAtom, action)
  return { store, request, run, project }
}

test('opening, drafting and cancelling never read or write the native workbook', async () => {
  const { store, request, run } = setup()
  expect(await run('open')).toBe(true)
  expect(store.getter(nativeNameManagerAtom)).toMatchObject({
    ownerSheetId: 'view', range: 'A2:A4', revision: 1,
  })
  await run({ name: 'Revenue' })
  expect(store.getter(nativeNamedRangesAtom)).toEqual(names)
  await run('close')
  expect(store.getter(nativeNameManagerAtom).ownerSheetId).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test.each(['create', 'update', 'delete'] as const)('%s uses one versioned command', async (kind) => {
  const { store, request, run } = setup()
  await run('open')
  if (kind !== 'create') await run({ edit: 'Sales' })
  else await run({ name: 'Sales', targetSheetId: 'source' })
  expect(await run(kind === 'delete' ? 'delete' : 'save')).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]).toMatchObject(['namedRange.change', {
    sheetId: 'view', revision: 1,
    action: kind === 'delete' ? { kind, name: 'Sales' } : {
      kind, name: 'Sales', ...(kind === 'update' ? { newName: 'Sales' } : {}),
      target: { sheetId: 'source', range: { rowStart: 1, colStart: 0, rowEnd: 3, colEnd: 0 } },
    },
  }])
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(2)
  expect(store.getter(nativeNameManagerAtom).ownerSheetId).toBeNull()
})

test('broken definitions can be renamed without inventing a target or repaired explicitly', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ edit: 'Deleted' })
  expect(store.getter(nativeNameManagerAtom).range).toBe('#REF!')
  await run({ name: 'Missing' }); await run('save')
  expect(request.mock.calls[0][1].action).toEqual({
    kind: 'update', name: 'Deleted', newName: 'Missing',
  })
  await run('open'); await run({ edit: 'Deleted' })
  await run({ range: 'B3', targetSheetId: 'source' }); await run('save')
  expect(request.mock.calls[1][1].action).toMatchObject({
    target: { sheetId: 'source', range: { rowStart: 2, colStart: 1, rowEnd: 2, colEnd: 1 } },
  })
})

test('deletion ignores unsaved invalid form fields', async () => {
  const { request, run } = setup()
  await run('open'); await run({ edit: 'Sales' })
  await run({ name: '', range: 'invalid', targetSheetId: 'missing' })
  expect(await run('delete')).toBe(true)
  expect(request.mock.calls[0][1].action).toEqual({ kind: 'delete', name: 'Sales' })
})

test('invalid targets and stale revisions are rejected before writing', async () => {
  const { store, request, run, project } = setup()
  await run('open'); await run({ name: 'Revenue' })
  for (const range of ['A0', 'A101', 'I1', 'garbage']) {
    await run({ range })
    expect(await run('save')).toBe(false)
  }
  await run({ range: 'A1' }); project(3)
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeNameManagerAtom).error).toContain('Reopen')
  expect(request).not.toHaveBeenCalled()
})

test('protected workbook rejects changes and native rejection preserves the draft for retry', async () => {
  const { store, request, run } = setup()
  await run('open'); await run({ name: 'Revenue' })
  store.setter(setSheetProtectionAtom, {
    sheetId: 'source', state: { mode: 'protected', unlockedRanges: [] },
  })
  expect(await run('save')).toBe(false)
  expect(request).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, {
    sheetId: 'source', state: { mode: 'open', unlockedRanges: [] },
  })
  request.mockRejectedValueOnce(new Error('Name already in use'))
  expect(await run('save')).toBe(false)
  expect(store.getter(nativeNameManagerAtom)).toMatchObject({
    name: 'Revenue', busy: false, error: 'Name already in use',
  })
  expect(await run('save')).toBe(true)
})

test('pending work has no optimistic names and prevents double submission', async () => {
  const { store, request, run } = setup()
  let finish!: (reply: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await run('open'); await run({ name: 'Revenue' })
  const pending = run('save')
  expect(store.getter(nativeNameManagerAtom).busy).toBe(true)
  expect(await run('save')).toBe(false)
  expect(await run('close')).toBe(false)
  expect(store.getter(nativeNamedRangesAtom)).toEqual(names)
  const input = request.mock.calls[0][1]
  finish({ changed: true, projection: { ...input.projection, cells: [],
    revision: 2, namedRanges: [] } })
  expect(await pending).toBe(true)
  expect(store.getter(nativeNamedRangesAtom)).toEqual([])
  expect(request).toHaveBeenCalledTimes(1)
})

test('late response after workbook disposal cannot publish names or leave a busy dialog', async () => {
  const { store, request, run } = setup()
  let finish!: (reply: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  await run('open'); await run({ name: 'Revenue' })
  const pending = run('save')
  store.setter(clearWorkbookDocumentAtom)
  const input = request.mock.calls[0][1]
  finish({ changed: true, projection: { ...input.projection, cells: [],
    revision: 2, namedRanges: names } })
  expect(await pending).toBe(false)
  expect(store.getter(nativeNamedRangesAtom)).toEqual([])
  expect(store.getter(nativeNameManagerAtom).busy).toBe(false)
})

test('catalog follows ordinary projections and cannot be mutated through a returned reference', () => {
  const { store, project } = setup()
  const catalog = store.getter(nativeNamedRangesAtom)
  expect(Object.isFrozen(catalog)).toBe(true)
  expect(Object.isFrozen(catalog[0].target?.range)).toBe(true)
  project(2, [])
  expect(store.getter(nativeNamedRangesAtom)).toEqual([])
})

test('workbook replacement hides a draft even when the new workbook has the same sheet ID', async () => {
  const { store, run } = setup()
  await run('open')
  expect(store.getter(nativeNameManagerOpenAtom)).toBe(true)
  store.setter(setRustWorkbookConnectionAtom, {
    request: vi.fn() as RustWorkbookConnection['request'], dispose() {},
  })
  expect(store.getter(nativeNameManagerOpenAtom)).toBe(false)
  expect(await run('save')).toBe(false)
})

test.each(['sheet', 'bounds', 'superseded'] as const)(
  '%s response never replaces the current name catalog', async (kind) => {
    const { store, request, run, project } = setup()
    await run('open'); await run({ name: 'Revenue' })
    request.mockImplementationOnce(async (_command, input) => {
      if (kind === 'superseded') project(3)
      return { changed: true, projection: { ...input.projection, cells: [], revision: 2,
        sheetId: kind === 'sheet' ? 'wrong' : 'view',
        namedRanges: kind === 'bounds'
          ? [{ name: 'Bad', target: { sheet: 0, range: [-1, 0, 3, 0] } }] : [],
      } }
    })
    expect(await run('save')).toBe(false)
    expect(store.getter(nativeNamedRangesAtom)).toEqual(names)
    expect(store.getter(nativeNameManagerAtom).busy).toBe(false)
    expect(store.getter(nativeNameManagerAtom).error).not.toBe('')
  },
)
