import { expect, test } from 'vitest'
import {
  configureFillSeriesAtom, namedListDirectoryAtom, projectionSnapshotAtom, selectCellAtom,
  setFillSeriesLocaleAtom, setRustWorkbookConnectionAtom, sortFeedbackAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { configureCustomListSortAtom as configure, customListSortPanelAtom as panel } from '../src/core'
import { saveList, setup, sorted } from './sort-fixture'

async function choose(store: Awaited<ReturnType<typeof setup>>['store'], listName = 'host:Priority') {
  await store.setter(configure, 'open')
  return store.setter(configure, { type: 'key', index: 0,
    key: { col: 1, direction: 'asc', listName } })
}

test('saved fill list is the same directory; Apply captures current values exactly once', async () => {
  const { store, sort, request } = await setup()
  expect(await saveList(store, 'Priority', 'High\nLow')).toBe(true)
  expect(store.getter(namedListDirectoryAtom).map(list => list.listName)).toEqual(['user:Priority'])
  await choose(store, 'user:Priority')
  // Editing the same source after selection must affect the next Apply snapshot.
  await store.setter(configureFillSeriesAtom, 'open')
  await store.setter(configureFillSeriesAtom, { field: 'listText', value: 'Mid\nHigh\nLow' })
  await store.setter(configureFillSeriesAtom, 'save-list')
  await store.setter(configureFillSeriesAtom, 'close')
  await store.setter(configure, 'add')
  await store.setter(configure, { type: 'header', value: true })
  await store.setter(configure, { type: 'case-sensitive', value: true })
  await store.setter(configure, { type: 'empty-first', value: true })
  expect(await store.setter(configure, 'apply')).toBe(true)
  expect(sort).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenCalledTimes(2)
  expect(sort.mock.lastCall![0]).toMatchObject({ keys: [
    { col: 1, direction: 'asc', list: { values: ['Mid', 'High', 'Low'], locale: 'en' } },
    { col: 2, direction: 'asc' },
  ], hasHeader: true, caseSensitive: true, emptyFirst: true })
  expect(store.getter(panel).target).toBeNull()
})

test('deleting a selected user source never silently falls back to its same-name host source', async () => {
  const { store, sort } = await setup()
  await saveList(store, 'Priority', 'High\nLow')
  await choose(store, 'user:Priority')
  await store.setter(configureFillSeriesAtom, 'open')
  await store.setter(configureFillSeriesAtom, 'delete-list')
  await store.setter(configureFillSeriesAtom, 'close')
  expect(store.getter(namedListDirectoryAtom).map(list => list.listName)).toEqual(['host:Priority'])
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('missingList')
  expect(store.getter(panel).keys[0]!.listName).toBe('user:Priority')
  expect(sort).not.toHaveBeenCalled()
  await store.setter(configure, { type: 'key', index: 0,
    key: { col: 1, direction: 'asc', listName: 'host:Priority' } })
  expect(await store.setter(configure, 'apply')).toBe(true)
})

test('host whitespace and locale are snapshotted; a locale collision invalidates the old source', async () => {
  const { store, sort } = await setup()
  store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: { I: [' I ', 'İ'] } })
  await saveList(store, 'ı', 'Other\nLast')
  await choose(store, 'host:I')
  store.setter(setFillSeriesLocaleAtom, { locale: 'tr', customLists: { I: [' I ', 'İ'] } })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('missingList')
  store.setter(setFillSeriesLocaleAtom, { locale: 'az', customLists: { Unique: [' I ', 'İ'] } })
  await choose(store, 'host:Unique')
  expect(await store.setter(configure, 'apply')).toBe(true)
  const key = sort.mock.lastCall![0].keys[0]!
  expect('list' in key ? key.list : undefined).toEqual({ values: [' I ', 'İ'], locale: 'az' })
})

test('missing choice, changed selection and native refusal retain drafts without fabricating a result', async () => {
  const { store, sort } = await setup()
  await store.setter(configure, 'open')
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('chooseList')
  await choose(store)
  sort.mockRejectedValueOnce(new Error('Unmerge cells before sorting this range.'))
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel)).toMatchObject({ busy: false, error: 'failed', keys: [
    { listName: 'host:Priority' },
  ] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 0 } })
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(store.getter(panel).error).toBe('selection')
  expect(sort).toHaveBeenCalledTimes(1)
})

test('level changes stay together, enforce bounds and cancel never writes', async () => {
  const { store, sort } = await setup()
  await choose(store)
  await store.setter(configure, 'add')
  await store.setter(configure, { type: 'move', index: 0, direction: 'down' })
  expect(store.getter(panel).keys[1]!.listName).toBe('host:Priority')
  for (const index of [-1, 0.5, 2])
    expect(await store.setter(configure, { type: 'remove', index })).toBe(false)
  expect(await store.setter(configure, { type: 'key', index: 0,
    key: { col: 1, direction: 'asc', listName: '' } })).toBe(false)
  await store.setter(configure, 'close')
  await store.setter(configure, 'open')
  expect(store.getter(panel).keys).toEqual([{ col: 1, direction: 'asc', listName: '' }])
  expect(sort).not.toHaveBeenCalled()
})

for (const reject of [false, true]) test(`old connection ${reject ? 'failure' : 'success'} cannot reset a new pending sort`, async () => {
  const first = await setup(), second = await setup()
  const { store, sort } = first
  await choose(store)
  let finish!: (value: ReturnType<typeof sorted>) => void
  let fail!: (reason: Error) => void
  sort.mockImplementationOnce(() => new Promise((resolve, rejectRequest) => {
    finish = resolve; fail = rejectRequest
  }))
  const old = store.setter(configure, 'apply')
  expect(store.getter(panel).busy).toBe(true)
  expect(await store.setter(configure, 'apply')).toBe(false)
  expect(await store.setter(configure, 'close')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, second.connection)
  expect(store.getter(panel).target).toBeNull()
  expect(store.getter(sortFeedbackAtom).busy).toBe(false)
  await choose(store)
  let nextFinish!: (value: ReturnType<typeof sorted>) => void
  second.sort.mockImplementationOnce(() => new Promise(resolve => { nextFinish = resolve }))
  const next = store.setter(configure, 'apply')
  const before = store.getter(projectionSnapshotAtom)
  if (reject) fail(new Error('old request failed'))
  else finish(sorted(sort.mock.lastCall![0]))
  expect(await old).toBe(false)
  expect(store.getter(panel).busy).toBe(true)
  expect(store.getter(sortFeedbackAtom).busy).toBe(true)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(second.store.getter(panel).target).toBeNull()
  nextFinish(sorted(second.sort.mock.lastCall![0]))
  expect(await next).toBe(true)
  expect(store.getter(panel).target).toBeNull()
})
