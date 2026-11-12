import { expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import { configureFillSeriesAtom as run, fillSeriesPanelAtom as panel,
  fillSeriesLocaleAtom, setFillSeriesLocaleAtom, selectCellAtom } from '../src'
import { nativeFillNamedListsAtom, effectiveFillSeriesLocaleAtom } from '../src/auto-fill/locale'
import { resetWorkbookViewAtom } from '../src/runtime/reset-workbook-view'
import { validateFillNamedLists } from '../src/auto-fill/named-list-candidates'

async function setup() {
  const store = createStore()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(run, 'open')
  const save = async (name = 'Priority', values = 'Low\nMedium\nHigh') => {
    await store.setter(run, { field: 'listName', value: name })
    await store.setter(run, { field: 'listText', value: values })
    return store.setter(run, 'save-list')
  }
  return { store, save }
}

test('host read-modify-write never absorbs saved user entries and Delete really removes them', async () => {
  const { store, save } = await setup()
  expect(store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: { Host: ['A', 'B'] } })).toBe(true)
  await save()
  const host = store.getter(fillSeriesLocaleAtom)
  expect(Object.keys(host.customLists!)).toEqual(['Host'])
  expect(store.getter(effectiveFillSeriesLocaleAtom).customLists).toHaveProperty('Priority')
  expect(store.setter(setFillSeriesLocaleAtom, { ...host, locale: 'tr' })).toBe(true)
  await store.setter(run, 'delete-list')
  expect(store.getter(nativeFillNamedListsAtom).map(list => list.listName)).toEqual(['host:Host'])
  expect(store.getter(fillSeriesLocaleAtom).customLists).not.toHaveProperty('Priority')
})

test.each(['tr', 'az'])('locale %s changes reject folded value and within-user name collisions atomically', async locale => {
  const { store, save } = await setup()
  await save('Letters', 'I\nı')
  const host = store.getter(fillSeriesLocaleAtom)
  const lists = store.getter(panel).lists
  expect(store.setter(setFillSeriesLocaleAtom, { ...host, locale })).toBe(false)
  expect(store.getter(fillSeriesLocaleAtom)).toBe(host)
  expect(store.getter(panel).lists).toBe(lists)
  await store.setter(run, 'delete-list')
  await save('I', 'Low\nHigh')
  await store.setter(run, 'new-list')
  await save('ı', 'Open\nClosed')
  expect(store.setter(setFillSeriesLocaleAtom, { ...host, locale })).toBe(false)
  expect(store.getter(panel).lists).toHaveLength(2)
})

test('cross-source names may collide in a new locale; user overrides host without deleting either source', async () => {
  const { store, save } = await setup()
  store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: { I: ['HostA', 'HostB'] } })
  await save('ı', 'UserA\nUserB')
  expect(store.getter(nativeFillNamedListsAtom)).toHaveLength(2)
  expect(store.setter(setFillSeriesLocaleAtom, { ...store.getter(fillSeriesLocaleAtom), locale: 'tr' })).toBe(true)
  expect(store.getter(nativeFillNamedListsAtom).map(list => list.listName)).toEqual(['user:ı'])
  await store.setter(run, 'delete-list')
  expect(store.getter(nativeFillNamedListsAtom).map(list => list.listName)).toEqual(['host:I'])
})

test.each(['tr', 'az'])('Save %s uses the same contextual fold as native matching', async locale => {
  const { store, save } = await setup()
  store.setter(setFillSeriesLocaleAtom, { locale })
  for (const values of ['I\nı', 'I\u0307\ni', 'ΟΣ\nος']) {
    expect(await save('Unicode', values)).toBe(false)
    expect(store.getter(panel).lists).toEqual([])
  }
  expect(await save('Unicode', 'I\ni')).toBe(true)
  expect(store.getter(nativeFillNamedListsAtom)[0]).toMatchObject({ locale, values: ['I', 'i'] })
})

test('draft/close are not candidates; stores isolate users and workbook replacement preserves host only', async () => {
  const { store, save } = await setup()
  store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: { Host: ['A', 'B'] } })
  await store.setter(run, { field: 'listText', value: 'Unsaved\nDraft' })
  await store.setter(run, 'close')
  expect(store.getter(nativeFillNamedListsAtom)).toHaveLength(1)
  await store.setter(run, 'open')
  await save()
  store.setter(selectCellAtom, { sheetId: 'other', coord: { row: 0, col: 0 } })
  expect(store.getter(nativeFillNamedListsAtom)).toHaveLength(2)
  const other = await setup()
  expect(other.store.getter(panel).lists).toEqual([])
  store.setter(resetWorkbookViewAtom)
  expect(store.getter(panel).lists).toEqual([])
  expect(store.getter(nativeFillNamedListsAtom).map(list => list.listName)).toEqual(['host:Host'])
})

test('maximum legal 32 host + 2 optional + 32 user candidates fit the aggregate UTF-16 budget', async () => {
  const { store, save } = await setup()
  const values = Array.from({ length: 512 }, (_, index) => `${index}`.padStart(31, '0'))
  const customLists = Object.fromEntries(Array.from({ length: 32 }, (_, index) =>
    [`Host ${index}`.padEnd(64, 'x'), values]))
  expect(store.setter(setFillSeriesLocaleAtom, { locale: 'en-Latn-US', weekdayNames: values,
    monthNames: values, customLists })).toBe(true)
  for (let index = 0; index < 32; index++) {
    await store.setter(run, 'new-list')
    expect(await save(`User ${index}`.padEnd(64, 'x'), values.join('\n'))).toBe(true)
  }
  const candidates = store.getter(nativeFillNamedListsAtom)
  expect(candidates).toHaveLength(66)
  expect(validateFillNamedLists(candidates)).toBe(true)
  const previous = store.getter(fillSeriesLocaleAtom)
  expect(store.setter(setFillSeriesLocaleAtom, { customLists: { ...customLists, Overflow: ['A', 'B'] } })).toBe(false)
  expect(store.getter(fillSeriesLocaleAtom)).toBe(previous)
  expect(store.setter(setFillSeriesLocaleAtom, { locale: 'tr', customLists: { I: ['A', 'B'], ı: ['C', 'D'] } })).toBe(false)
  expect(store.setter(setFillSeriesLocaleAtom, { customLists: { ['x'.repeat(65)]: ['A', 'B'] } })).toBe(false)
  expect(store.setter(setFillSeriesLocaleAtom, { customLists: { Huge: ['😀'.repeat(8192), 'B'] } })).toBe(false)
})
