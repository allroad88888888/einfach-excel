import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  setSelectionAtom,
  runVisibleProjectionAtom,
  runNativeFilterAtom,
  nativeFilterRangeAtom,
  nativeFilterRulesAtom,
  nativeFilterPanelAtom,
  configureNativeFilterAtom,
  type ColumnFilterRule,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import { changeFilter } from '../src/rust-workbook/filter-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

type Input = RustWorkbookCommands['sheet.filter']['payload']
const range = { rowStart: 2, rowEnd: 5, colStart: 1, colEnd: 3 }
async function setup() {
  let rules: readonly ColumnFilterRule[] = []
  let region: typeof range | undefined
  let revision = 0
  const project = (request: VisibleProjectionRequest) => ({
    ...request,
    revision,
    cells: [],
    filterRules: rules,
    ...(region ? { filterRange: region } : {}),
    visibility: { manualRows: [], manualColumns: [], filterRows: [] },
  })
  const filter = vi.fn(async (input: Input) => {
    if (input.action === 'apply') {
      rules = input.rules
      region = input.range
    }
    if (input.action === 'clear') {
      rules = []
      region = undefined
    }
    revision++
    return { hiddenRows: 0, projection: project(input.projection) }
  })
  const request = (async (cmd: string, input: unknown) =>
    cmd === 'sheet.filter'
      ? filter(input as Input)
      : project(
          (input as { request: VisibleProjectionRequest }).request,
        )) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Orders', index: 0, rowCount: 100, colCount: 8 }],
  })
  store.setter(setSelectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 2, col: 1 },
    focus: { row: 5, col: 3 },
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
  })
  return { store, filter }
}

test('selected range is captured once; no conditions still publishes its native header extent', async () => {
  const { store, filter } = await setup()
  expect(await store.setter(runNativeFilterAtom, 'selection')).toBe(true)
  expect(filter).toHaveBeenCalledTimes(1)
  expect(filter.mock.lastCall![0]).toMatchObject({ action: 'apply', range, rules: [] })
  expect(store.getter(nativeFilterRangeAtom)).toEqual(range)
  await store.setter(runNativeFilterAtom, { action: 'clear' })
  expect(store.getter(nativeFilterRangeAtom)).toBeUndefined()
})

test('editing and clearing one column preserves other native conditions and the empty header region', async () => {
  const { store } = await setup()
  await store.setter(runNativeFilterAtom, {
    action: 'apply',
    range,
    rules: [
      { kind: 'equals', colIndex: 1, value: 'West' },
      { kind: 'equals', colIndex: 2, value: 'Open' },
    ],
  })
  await store.setter(configureNativeFilterAtom, { type: 'open-column', col: 1 })
  expect(store.getter(nativeFilterPanelAtom)).toMatchObject({
    column: 1,
    range,
    conditions: [{ col: 1, value: 'West' }],
  })
  expect(await store.setter(configureNativeFilterAtom, 'add')).toBe(false)
  await store.setter(configureNativeFilterAtom, {
    type: 'change',
    index: 0,
    patch: { value: 'East' },
  })
  await store.setter(configureNativeFilterAtom, 'apply')
  expect(store.getter(nativeFilterRulesAtom)).toEqual([
    { kind: 'equals', colIndex: 2, value: 'Open' },
    { kind: 'equals', colIndex: 1, value: 'East', caseSensitive: false },
  ])
  for (const col of [1, 2]) {
    await store.setter(configureNativeFilterAtom, { type: 'open-column', col })
    await store.setter(configureNativeFilterAtom, 'clear-column')
    expect(store.getter(nativeFilterRangeAtom)).toEqual(range)
  }
  expect(store.getter(nativeFilterRulesAtom)).toEqual([])
  expect(await store.setter(configureNativeFilterAtom, { type: 'open-column', col: 0 })).toBe(false)
})

test('worker forwards one bounded native filter request and rejects invalid range or column first', () => {
  const applyFilter = vi.fn(() => ({ ok: true, hiddenRows: [], scannedRows: 3, predicateCells: 3 }))
  const workbook = {
    applyFilter,
    clearFilter() {},
    reapplyFilter() {},
    sheet_visibility() {},
    history_state() {},
    read_sparse_range() {},
    snapshot_format_range() {},
  } as unknown as WasmWorkbook
  const payload: Input = {
    action: 'apply',
    sheetId: 's',
    range,
    rules: [{ kind: 'equals', colIndex: 1, value: 'West' }],
    projection: { kind: 'visible-window', sheetId: 's', requestId: 1, window: range },
  }
  changeFilter(workbook, 0, 8, payload, 100)
  expect(applyFilter).toHaveBeenCalledWith(0, { range, rules: payload.rules })
  for (const invalid of [
    { ...range, rowEnd: 100 },
    { ...range, rowEnd: 2 },
    { ...range, colStart: 2 },
  ])
    expect(() => changeFilter(workbook, 0, 8, { ...payload, range: invalid }, 100)).toThrow(
      'header',
    )
  expect(applyFilter).toHaveBeenCalledTimes(1)
})
