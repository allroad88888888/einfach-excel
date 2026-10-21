import { expect, test } from 'vitest'
import { configureNativeFilterAtom, configureNativeFilterValuesAtom, nativeFilterValuesAtom } from '../../src'
import { setup } from './fixture'
import type { FilterValuesAction } from '../../src/filter/values'

test.each(['range', 'table'] as const)('%s selects and clears every search match in one request across pages', async (scope) => {
  const { store, values, filter, table } = await setup(scope)
  const run = (action: FilterValuesAction) =>
    store.setter(configureNativeFilterValuesAtom, action)
  await run({ type: 'open', index: 0 })
  await run({ type: 'search-text', value: 'Order 0' }); await run('search')
  expect(store.getter(nativeFilterValuesAtom)!.page!.total).toBe(999)
  const before = values.mock.calls.length
  expect(await run('select-search')).toBe(true)
  expect(values).toHaveBeenCalledTimes(before + 1)
  expect(values.mock.lastCall![0]).toMatchObject({ allMatches: true, offset: 0, search: 'Order 0',
    table: scope === 'table' ? 'Orders' : undefined })
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(999)
  await run('next')
  expect(store.getter(nativeFilterValuesAtom)!.selected).toContain('Order 0999')
  await run({ type: 'search-text', value: 'Order 000' }); await run('search')
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(999)
  await run('clear-search')
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(990)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toContain('Order 0999')
  expect(store.getter(nativeFilterValuesAtom)!.selected).not.toContain('Order 0001')
  expect(filter).not.toHaveBeenCalled(); expect(table).not.toHaveBeenCalled()
  await run({ type: 'search-text', value: 'Order 1000' }); await run('search'); await run('select-page')
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(991)
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
  expect(scope === 'range' ? filter : table).toHaveBeenCalledTimes(1)
})

test.each(['reject', 'truncate', 'duplicate', 'revision'] as const)('%s complete-match response keeps the current draft and page', async (failure) => {
  const { store, values } = await setup()
  const run = (action: FilterValuesAction) =>
    store.setter(configureNativeFilterValuesAtom, action)
  await run({ type: 'open', index: 0 }); await run('select-page')
  const before = store.getter(nativeFilterValuesAtom)!
  if (failure === 'reject') values.mockRejectedValueOnce(new Error('Native 1,000-value budget'))
  else values.mockResolvedValueOnce({ revision: failure === 'revision' ? 2 : 1, total: 2, offset: 0,
    values: failure === 'truncate' ? [{ value: 'partial', count: 1 }]
      : [{ value: 'duplicate', count: 1 }, { value: 'duplicate', count: 1 }] })
  expect(await run('select-search')).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toEqual(before.selected)
  expect(store.getter(nativeFilterValuesAtom)!.page).toEqual(before.page)
  expect(store.getter(nativeFilterValuesAtom)!.error).not.toBe('')
  await run({ type: 'search-text', value: 'Order 1000' }); await run('search')
  expect(await run('select-search')).toBe(true)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(51)
})

test.each(['response', 'merged'] as const)('%s selection over 1 MiB is rejected without changing the draft or page', async (budget) => {
  const { store, values, filter } = await setup()
  const run = (action: FilterValuesAction) => store.setter(configureNativeFilterValuesAtom, action)
  const selected = budget === 'merged'
    ? Array.from({ length: 34 }, (_, index) => `${index}${'x'.repeat(30_000)}`) : ['Order 0001']
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 0,
    patch: { kind: 'list', values: selected } })
  await run({ type: 'open', index: 0 })
  const before = store.getter(nativeFilterValuesAtom)!
  const matches = budget === 'merged' ? ['y'.repeat(30_000)]
    : Array.from({ length: 40 }, (_, index) => `${index}${'y'.repeat(30_000)}`)
  values.mockResolvedValueOnce({ revision: 1, total: matches.length, offset: 0,
    values: matches.map((value) => ({ value, count: 1 })) })
  expect(await run('select-search')).toBe(false)
  expect(values.mock.lastCall![0]).toMatchObject({ allMatches: true, offset: 0 })
  expect(store.getter(nativeFilterValuesAtom)!.selected).toEqual(before.selected)
  expect(store.getter(nativeFilterValuesAtom)!.page).toEqual(before.page)
  expect(store.getter(nativeFilterValuesAtom)!.error).not.toBe('')
  expect(filter).not.toHaveBeenCalled()
  await run({ type: 'search-text', value: 'Order 1000' }); await run('search')
  expect(await run('select-search')).toBe(true)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toEqual([...selected, 'Order 1000'])
})

test.each(['select-page', 'toggle'] as const)('%s keeps the 1 MiB budget for new page choices', async (action) => {
  const { store, values, filter } = await setup()
  const selected = Array.from({ length: 34 }, (_, index) => `${index}${'x'.repeat(30_000)}`)
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 0,
    patch: { kind: 'list', values: selected } })
  const candidate = 'y'.repeat(30_000)
  values.mockResolvedValueOnce({ revision: 1, total: 1, offset: 0,
    values: [{ value: candidate, count: 1 }] })
  await store.setter(configureNativeFilterValuesAtom, { type: 'open', index: 0 })
  const before = store.getter(nativeFilterValuesAtom)!
  expect(await store.setter(configureNativeFilterValuesAtom,
    action === 'select-page' ? action : { type: 'toggle', value: candidate })).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toEqual(before.selected)
  expect(store.getter(nativeFilterValuesAtom)!.page).toEqual(before.page)
  expect(store.getter(nativeFilterValuesAtom)!.error).toContain('1 MiB')
  expect(filter).not.toHaveBeenCalled()
})

test('closing while complete matches load discards the result and does not submit old choices', async () => {
  const { store, values, page, filter } = await setup()
  await store.setter(configureNativeFilterValuesAtom, { type: 'open', index: 0 })
  let finish!: (value: ReturnType<typeof page>) => void
  values.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(configureNativeFilterValuesAtom, 'select-search')
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  await store.setter(configureNativeFilterAtom, 'close')
  finish(page(values.mock.lastCall![0])); expect(await pending).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)).toBeNull()
  expect(filter).not.toHaveBeenCalled()
})
