import { expect, test } from 'vitest'
import {
  configureAdvancedFilterAtom, configureNativeFilterAtom, nativeAdvancedFilterGroupsAtom,
  nativeFilterPanelAtom, setSheetProtectionAtom,
} from '../../src'
import { setup } from './fixture'

test.each(['range', 'table'] as const)('%s group and condition edits remain a draft until one native apply', async (scope) => {
  const { store, filter, table } = await setup(scope)
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 0, patch: { value: 'West' } })
  expect(store.setter(configureAdvancedFilterAtom, 'add-group')).toBe(true)
  expect(store.setter(configureAdvancedFilterAtom, { type: 'add-condition', group: 0 })).toBe(true)
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 1, patch: { col: 1, value: 'East' } })
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 2,
    patch: { kind: 'range', col: 2, min: '10', max: '20' } })
  expect(store.getter(nativeAdvancedFilterGroupsAtom).map((group) => group.conditions.length))
    .toEqual([2, 1])
  expect(filter).not.toHaveBeenCalled(); expect(table).not.toHaveBeenCalled()
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
  const input = scope === 'range' ? filter.mock.lastCall![0] : table.mock.lastCall![0].action
  expect(input).toMatchObject({ rules: [], groups: [
    { rules: [{ kind: 'equals', colIndex: 0, value: 'West' }, { kind: 'range', colIndex: 2, min: 10, max: 20 }] },
    { rules: [{ kind: 'equals', colIndex: 1, value: 'East' }] },
  ] })
  expect(scope === 'range' ? filter : table).toHaveBeenCalledTimes(1)
  await store.setter(configureNativeFilterAtom, 'open')
  expect(store.getter(nativeFilterPanelAtom).advanced).toBe(true)
  expect(store.getter(nativeAdvancedFilterGroupsAtom).map((group) => group.conditions.length))
    .toEqual([2, 1])
})

test('removing a group removes its conditions and keeps the last group nonempty', async () => {
  const { store, filter } = await setup()
  store.setter(configureAdvancedFilterAtom, 'add-group')
  store.setter(configureAdvancedFilterAtom, { type: 'add-condition', group: 1 })
  expect(store.setter(configureAdvancedFilterAtom, { type: 'remove-group', group: 0 })).toBe(true)
  expect(store.getter(nativeFilterPanelAtom).conditions).toHaveLength(2)
  expect(store.setter(configureAdvancedFilterAtom, { type: 'remove-group', group: 1 })).toBe(false)
  expect(await store.setter(configureNativeFilterAtom, { type: 'remove', index: 0 })).toBe(true)
  expect(await store.setter(configureNativeFilterAtom, { type: 'remove', index: 0 })).toBe(false)
  await store.setter(configureNativeFilterAtom, 'close')
  expect(filter).not.toHaveBeenCalled()
})

test('invalid numeric condition and protected apply preserve the complete editable draft', async () => {
  const { store, filter } = await setup()
  store.setter(configureAdvancedFilterAtom, 'add-group')
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 1,
    patch: { kind: 'range', min: 'bad' } })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(store.getter(nativeFilterPanelAtom).conditions[1].min).toBe('bad')
  expect(filter).not.toHaveBeenCalled()
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 1, patch: { min: '10' } })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(store.getter(nativeFilterPanelAtom).conditions).toHaveLength(2)
  expect(filter).not.toHaveBeenCalled()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'open', unlockedRanges: [] } })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
})

test('native apply rejection retains groups and can be corrected without losing the draft', async () => {
  const { store, filter } = await setup()
  store.setter(configureAdvancedFilterAtom, 'add-group')
  filter.mockRejectedValueOnce(new Error('Native budget exceeded'))
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(store.getter(nativeFilterPanelAtom)).toMatchObject({ advanced: true, error: 'Native budget exceeded' })
  expect(store.getter(nativeFilterPanelAtom).conditions).toHaveLength(2)
  store.setter(configureAdvancedFilterAtom, { type: 'remove-group', group: 1 })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
})

test('opening an OR-filtered header retains every group rather than silently narrowing the filter', async () => {
  const groups = [{ rules: [{ kind: 'equals' as const, colIndex: 0, value: 'West' }] },
    { rules: [{ kind: 'equals' as const, colIndex: 1, value: 'East' }] }]
  const { store } = await setup('range', groups)
  await store.setter(configureNativeFilterAtom, { type: 'open-column', col: 0 })
  expect(store.getter(nativeFilterPanelAtom)).toMatchObject({ column: undefined, advanced: true })
  expect(store.getter(nativeFilterPanelAtom).conditions).toHaveLength(2)
})

test('stale revision prevents group edits and group limits are explicit', async () => {
  const { store, refresh, changeRevision } = await setup()
  for (let i = 1; i < 8; i++) expect(store.setter(configureAdvancedFilterAtom, 'add-group')).toBe(true)
  expect(store.setter(configureAdvancedFilterAtom, 'add-group')).toBe(false)
  for (let i = 1; i < 8; i++) expect(store.setter(configureAdvancedFilterAtom, { type: 'add-condition', group: 0 })).toBe(true)
  expect(store.setter(configureAdvancedFilterAtom, { type: 'add-condition', group: 0 })).toBe(false)
  changeRevision(); await refresh()
  expect(store.setter(configureAdvancedFilterAtom, { type: 'remove-group', group: 1 })).toBe(false)
})
