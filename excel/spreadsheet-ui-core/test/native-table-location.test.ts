import { expect, test } from 'vitest'
import { setup } from './native-name-test-fixture'
import { activeWorkbookSheetAtom, beginProjectionAtom, resolveProjectionAtom, selectionSnapshotAtom,
  projectionSnapshotAtom, nativeNameManagerAtom, nativeNameManagerOpenAtom,
  runNativeNameManagerAtom,
  type NativeTable } from '../src'

const table: NativeTable = { name: 'Inventory', sheet: 'Summary', sheetIndex: 1,
  range: 'A80:B84', columns: ['Product', 'Amount'], hasHeaders: true, hasTotals: true }
function prepare() {
  const { store, request } = setup()
  const publish = (tables: readonly NativeTable[]) => {
    const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 'orders',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 }, reason: 'viewport' })
    if (read.status !== 'started' || read.request.kind !== 'visible-window') throw new Error('Expected projection')
    store.setter(resolveProjectionAtom, { request: read.request,
      result: { ...read.request, cells: [], namedRanges: [], tables, revision: 8 } })
  }
  publish([table])
  const run = (action: Parameters<typeof runNativeNameManagerAtom.write>[2]) =>
    store.setter(runNativeNameManagerAtom, action)
  return { store, request, publish, run }
}

test('cross-sheet Table navigation selects the whole current range without a workbook command', async () => {
  const { store, request, run } = prepare()
  await run('open')
  expect(store.getter(nativeNameManagerAtom).tables).toEqual([table])
  expect(await run({ locateTable: 'Inventory' })).toBe(true)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  expect(store.getter(selectionSnapshotAtom)).toMatchObject({
    selection: { sheetId: 'summary' }, range: { rowStart: 79, rowEnd: 83, colStart: 0, colEnd: 1 },
  })
  expect(store.getter(nativeNameManagerOpenAtom)).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test('navigation uses the latest table range rather than the old dialog coordinates', async () => {
  const { store, request, publish, run } = prepare()
  await run('open'); publish([{ ...table, range: 'C20:D25' }])
  await run({ locateTable: 'Inventory' })
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 19, rowEnd: 24, colStart: 2, colEnd: 3,
  })
  expect(request).not.toHaveBeenCalled()
})

test.each(['missing', 'bounds', 'sheet'] as const)('%s target cannot change sheet or selection', async (kind) => {
  const { store, request, publish, run } = prepare()
  await run('open')
  const before = store.getter(selectionSnapshotAtom)
  publish(kind === 'missing' ? [] : [{ ...table,
    ...(kind === 'bounds' ? { range: 'A100:B101' } : { sheetIndex: 99 }) }])
  expect(await run({ locateTable: 'Inventory' })).toBe(false)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
  expect(store.getter(selectionSnapshotAtom)).toEqual(before)
  expect(store.getter(nativeNameManagerAtom).error).not.toBe('')
  expect(store.getter(projectionSnapshotAtom).result?.revision).toBe(8)
  expect(request).not.toHaveBeenCalled()
})
