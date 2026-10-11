import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, selectCellAtom, runVisibleProjectionAtom,
  configureNativeFilterAtom, nativeFilterPanelAtom, configureNativeFilterValuesAtom,
  nativeFilterValuesAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest, type ColumnFilterRule,
} from '../src'
import type { FilterValuesAction } from '../src/filter/values'

type Query = RustWorkbookCommands['sheet.filterValues']['payload']
type Page = RustWorkbookCommands['sheet.filterValues']['result']
type Filter = RustWorkbookCommands['sheet.filter']['payload']
type Table = RustWorkbookCommands['table.change']['payload']
const items = ['', 'two\nlines', ...Array.from({ length: 118 }, (_, index) => `Item ${index}`)]
async function setup(scope: 'range' | 'table' = 'range', initialRules: readonly ColumnFilterRule[] = []) {
  let revision = 1
  let rules = initialRules
  const page = (input: Query): Page => {
    const values = items.filter((value) => value.toLowerCase().includes(input.search.toLowerCase()))
    return { revision, total: values.length, offset: Math.min(input.offset, values.length),
      values: values.slice(input.offset, input.offset + input.limit)
        .map((value) => ({ value, count: 1 })) }
  }
  const query = vi.fn(async (input: Query) => page(input))
  const project = (request: VisibleProjectionRequest) => ({ ...request, revision, cells: [],
    filterRange: { rowStart: 0, rowEnd: 200, colStart: 0, colEnd: 1 },
    filterRules: scope === 'range' ? rules : [],
    tables: [{ name: 'Orders', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B201',
      hasHeaders: true, hasTotals: false, columns: ['Item', 'Qty'],
      ...(scope === 'table' && rules.length ? { autoFilter: { rules } } : {}) }],
    visibility: { manualRows: [], manualColumns: [], filterRows: [] },
  })
  const filter = vi.fn(async (input: Filter) => {
    rules = input.action === 'apply' ? input.rules : []
    revision++
    return { hiddenRows: 0, projection: project(input.projection) }
  })
  const table = vi.fn(async (input: Table) => {
    if (input.action.kind === 'filter') rules = input.action.rules
    revision++
    return { changed: true, projection: project(input.projection) }
  })
  const request = (async (command: string, input: unknown) => command === 'sheet.filterValues'
    ? query(input as Query) : command === 'sheet.filter' ? filter(input as Filter)
      : command === 'table.change' ? table(input as Table)
        : project((input as { request: VisibleProjectionRequest }).request)) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 300, colCount: 8 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  const refresh = () => store.setter(runVisibleProjectionAtom, { sheetId: 's',
    window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 7 } })
  await refresh()
  const open = () => store.setter(configureNativeFilterAtom,
    { type: 'open-column', col: 0, ...(scope === 'table' ? { table: 'Orders' } : {}) })
  expect(await open()).toBe(true)
  const run = (action: FilterValuesAction) =>
    store.setter(configureNativeFilterValuesAtom, action)
  return { store, query, filter, table, run, open, page, refresh, changeRevision: () => revision++ }
}

test.each(['range', 'table'] as const)('%s picker keeps exact values across pages and uses the existing commit', async (scope) => {
  const { store, run, query, filter, table, open } = await setup(scope, [
    { kind: 'equals', colIndex: 1, value: 'Keep other column' },
  ])
  await run({ type: 'open', index: 0 })
  expect(query.mock.lastCall![0]).toMatchObject({ column: 0, table: scope === 'table' ? 'Orders' : undefined,
    offset: 0, limit: 50, expectedRevision: 1 })
  await run({ type: 'toggle', value: '' }); await run({ type: 'toggle', value: 'two\nlines' })
  await run('next')
  const later = store.getter(nativeFilterValuesAtom)!.page!.values[0].value
  await run({ type: 'toggle', value: later })
  await run({ type: 'search-text', value: 'Item 117' })
  expect(query).toHaveBeenCalledTimes(2)
  await run('search')
  expect(store.getter(nativeFilterValuesAtom)).toMatchObject({ selected: ['', 'two\nlines', later],
    page: { total: 1, offset: 0, values: [{ value: 'Item 117', count: 1 }] } })
  await run({ type: 'toggle', value: 'Item 117' })
  expect(filter).not.toHaveBeenCalled(); expect(table).not.toHaveBeenCalled()
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
  const submitted = scope === 'table' ? table.mock.lastCall![0].action : filter.mock.lastCall![0]
  expect(submitted).toMatchObject({ rules: [
    { kind: 'equals', colIndex: 1, value: 'Keep other column' },
    { kind: 'list', colIndex: 0, values: ['', 'two\nlines', later, 'Item 117'] },
  ] })
  expect(scope === 'table' ? table : filter).toHaveBeenCalledTimes(1)
  await open()
  expect(store.getter(nativeFilterPanelAtom).conditions[0].values).toEqual(['', 'two\nlines', later, 'Item 117'])
})

test('closing or changing a column prevents an outstanding page from being published', async () => {
  const { store, run, query, page, open } = await setup()
  let finish!: (page: Page) => void
  query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = run({ type: 'open', index: 0 })
  expect(await run('next')).toBe(false)
  await store.setter(configureNativeFilterAtom, 'close'); await open()
  finish(page(query.mock.lastCall![0])); expect(await pending).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)).toBeNull()
  query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const next = run({ type: 'open', index: 0 })
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 0, patch: { col: 1 } })
  finish(page(query.mock.lastCall![0])); expect(await next).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)).toBeNull()
})

test('typing a new search discards the old response, keeps typing responsive and retains selected values', async () => {
  const { store, run, query, page } = await setup()
  await run({ type: 'open', index: 0 }); await run({ type: 'toggle', value: '' })
  let finish!: (page: Page) => void
  query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = run('next'), old = query.mock.lastCall![0]
  await run({ type: 'search-text', value: 'missing' }); await run('search')
  expect(store.getter(nativeFilterValuesAtom)).toMatchObject({ selected: [''], page: { total: 0, values: [] } })
  finish(page(old)); expect(await pending).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)).toMatchObject({ page: { total: 0, values: [] } })
})

test('native failure can retry without clearing the draft; clearing a selection is not a blank-value filter', async () => {
  const { store, run, query } = await setup()
  await run({ type: 'open', index: 0 }); await run('select-page')
  query.mockRejectedValueOnce(new Error('Native scan limit'))
  expect(await run('next')).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)).toMatchObject({ error: 'Native scan limit', busy: false })
  expect(store.getter(nativeFilterValuesAtom)!.selected).toHaveLength(50)
  await run('retry'); await run('clear-selection')
  expect(store.getter(nativeFilterPanelAtom).conditions[0]).toMatchObject({ kind: 'list', values: [] })
})

test('a changed workbook rejects both pages and an ordinary-range draft', async () => {
  const { store, run, query, filter, refresh, changeRevision } = await setup()
  changeRevision(); await refresh()
  expect(await run({ type: 'open', index: 0 })).toBe(false)
  expect(query).not.toHaveBeenCalled()
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(filter).not.toHaveBeenCalled()
  expect(store.getter(nativeFilterPanelAtom).error).toContain('worksheet changed')
})

test.each([
  { total: -1 }, { offset: 1 }, { total: 50001 }, { revision: 2 },
  { total: 1, values: [{ value: 'bad count', count: 0 }] },
  { total: 2, values: [{ value: 'same', count: 1 }, { value: 'same', count: 1 }] },
  { total: 60, values: [{ value: 'silently truncated', count: 1 }] },
])('malformed native page rejects without publishing a partial answer: %j', async (patch) => {
  const { store, run, query } = await setup()
  query.mockResolvedValueOnce({ revision: 1, total: 0, offset: 0, values: [], ...patch })
  expect(await run({ type: 'open', index: 0 })).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)!.error).toContain('invalid')
  expect(store.getter(nativeFilterValuesAtom)!.page).toBeUndefined()
})

test('selection limit never truncates values and can be corrected in the same page', async () => {
  const selected = Array.from({ length: 1000 }, (_, i) => `Chosen ${i}`)
  const { store, run } = await setup('range', [{ kind: 'list', colIndex: 0, values: selected }])
  await run({ type: 'open', index: 0 })
  expect(await run({ type: 'toggle', value: '' })).toBe(false)
  expect(store.getter(nativeFilterValuesAtom)!.selected).toEqual(selected)
  expect(store.getter(nativeFilterValuesAtom)!.error).toContain('1,000')
  await run('clear-selection'); await run({ type: 'toggle', value: '' })
  expect(store.getter(nativeFilterValuesAtom)).toMatchObject({ selected: [''], error: '' })
})
