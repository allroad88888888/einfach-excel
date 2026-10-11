import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, selectCellAtom,
  runVisibleProjectionAtom, configureNativeFilterAtom, nativeFilterPanelAtom,
  nativeFilterTargetAtom, nativeFilterRulesAtom, nativeFilterFeedbackAtom,
  projectionSnapshotAtom, selectionSnapshotAtom, setRustWorkbookConnectionAtom,
  type NativeTable, type RustWorkbookCommands, type RustWorkbookConnection,
  type VisibleProjectionRequest } from '../src'

type Input = RustWorkbookCommands['table.change']['payload']
const regionRules = [{ kind: 'equals' as const, colIndex: 3, value: 'Region' }]
async function setup() {
  let revision = 1
  let tables: NativeTable[] = ['North', 'South'].map((name, index) => ({ name,
    sheet: 'Sheet', sheetIndex: 0, range: index ? 'A7:B10' : 'A1:B4',
    hasHeaders: true, hasTotals: false, columns: ['Item', 'Amount'],
    autoFilter: { rules: [{ kind: 'equals', colIndex: 0, value: name },
      { kind: 'range', colIndex: 1, min: 2 }] },
  }))
  let hidden: number[] = []
  const project = (request: VisibleProjectionRequest) => ({ ...request, revision, cells: [],
    tables, filterRules: regionRules,
    filterRange: { rowStart: 12, rowEnd: 16, colStart: 3, colEnd: 4 },
    visibility: { manualRows: [], manualColumns: [], filterRows: hidden },
  })
  const table = vi.fn(async (input: Input) => {
    const action = input.action
    if (action.kind === 'filter' || action.kind === 'clear-filter') {
      tables = tables.map((entry) => entry.name !== action.name ? entry : { ...entry,
        autoFilter: action.kind === 'filter' && action.rules.length ? { rules: action.rules } : undefined })
    }
    revision++
    return { changed: true, projection: project(input.projection) }
  })
  const normal = vi.fn(async (input: RustWorkbookCommands['sheet.filter']['payload']) =>
    ({ hiddenRows: 0, projection: project(input.projection) }))
  const request = vi.fn(async (command: string, input: unknown) => command === 'table.change'
    ? table(input as Input) : command === 'sheet.filter'
      ? normal(input as RustWorkbookCommands['sheet.filter']['payload'])
      : project((input as { request: VisibleProjectionRequest }).request))
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }] })
  const select = (row: number, col = 0) => store.setter(selectCellAtom, { sheetId: 's', coord: { row, col } })
  const refresh = () => store.setter(runVisibleProjectionAtom, { sheetId: 's',
    window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 7 } })
  await refresh()
  select(0)
  return { store, table, normal, request, select, refresh, project,
    changeRevision: () => revision++, hide: (rows: number[]) => { hidden = rows } }
}

test('header target overrides selection and preserves other column, table and region rules', async () => {
  const { store, table, normal, select } = await setup()
  select(6)
  expect(store.getter(nativeFilterTargetAtom).table).toBe('South')
  await store.setter(configureNativeFilterAtom, { type: 'open-column', table: 'North', col: 1 })
  expect(store.getter(nativeFilterPanelAtom)).toMatchObject({ table: 'North', column: 1,
    conditions: [{ kind: 'range', col: 1, min: '2' }] })
  await store.setter(configureNativeFilterAtom, { type: 'change', index: 0, patch: { min: '3' } })
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(true)
  expect(table.mock.lastCall![0].action).toEqual({ kind: 'filter', name: 'North', rules: [
    { kind: 'equals', colIndex: 0, value: 'North' }, { kind: 'range', colIndex: 1, min: 3 },
  ] })
  expect(store.getter(nativeFilterRulesAtom)).toEqual(regionRules)
  expect(store.getter(nativeFilterTargetAtom).rules[1]).toMatchObject({ min: 2 })
  expect(normal).not.toHaveBeenCalled()
})

test('toolbar clear and reapply resolve only the current Table; outside it remains the normal filter', async () => {
  const { store, table, normal, select } = await setup()
  await store.setter(configureNativeFilterAtom, 'reapply')
  expect(table.mock.lastCall![0].action).toEqual({ kind: 'reapply-filter', name: 'North' })
  select(6)
  await store.setter(configureNativeFilterAtom, 'clear')
  expect(table.mock.lastCall![0].action).toEqual({ kind: 'clear-filter', name: 'South' })
  select(0)
  expect(store.getter(nativeFilterTargetAtom).rules).toHaveLength(2)
  select(12, 3)
  await store.setter(configureNativeFilterAtom, 'clear')
  expect(normal.mock.lastCall![0].action).toBe('clear')
  expect(table).toHaveBeenCalledTimes(2)
})

test('clear-column uses the named table conditions even when a different table remains selected', async () => {
  const { store, table, select } = await setup()
  select(6)
  await store.setter(configureNativeFilterAtom, { type: 'open-column', table: 'North', col: 0 })
  expect(await store.setter(configureNativeFilterAtom, 'clear-column')).toBe(true)
  expect(table.mock.lastCall![0].action).toEqual({ kind: 'filter', name: 'North',
    rules: [{ kind: 'range', colIndex: 1, min: 2 }] })
})

test('a changed workbook rejects an old table draft without a command or losing its text', async () => {
  const { store, table, refresh, changeRevision } = await setup()
  await store.setter(configureNativeFilterAtom, 'open')
  changeRevision(); await refresh()
  expect(await store.setter(configureNativeFilterAtom, 'apply')).toBe(false)
  expect(table).not.toHaveBeenCalled()
  expect(store.getter(nativeFilterPanelAtom).error).toMatch(/Close and reopen/)
  expect(store.getter(nativeFilterPanelAtom).conditions[0].value).toBe('North')
})

test('filtered selection stays inside its table, and a moved selection is not stolen by a late reply', async () => {
  const { store, table, select, hide, project } = await setup()
  select(3); hide([1, 2, 3])
  await store.setter(configureNativeFilterAtom, 'reapply')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 0, col: 0 })
  let finish!: (value: Awaited<ReturnType<typeof table>>) => void
  table.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(configureNativeFilterAtom, 'reapply')
  select(6)
  finish({ changed: false, projection: project(table.mock.lastCall![0].projection) })
  await pending
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 6, col: 0 })
})

test('when another scope hides the whole table including its header, selection falls back to a visible sheet row', async () => {
  const { store, select, hide } = await setup()
  select(8); hide([6, 7, 8, 9])
  await store.setter(configureNativeFilterAtom, 'reapply')
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 10, col: 0 })
})

test('busy and disposed connection cannot publish a second or foreign result', async () => {
  const { store, table, project } = await setup()
  let finish!: (value: Awaited<ReturnType<typeof table>>) => void
  table.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const before = store.getter(projectionSnapshotAtom)
  const pending = store.setter(configureNativeFilterAtom, 'clear')
  expect(store.getter(nativeFilterFeedbackAtom).busy).toBe(true)
  expect(await store.setter(configureNativeFilterAtom, 'reapply')).toBe(false)
  store.setter(setRustWorkbookConnectionAtom, null)
  finish({ changed: true, projection: project(table.mock.lastCall![0].projection) })
  expect(await pending).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(table).toHaveBeenCalledTimes(1)
})

test.each(['missing-visibility', 'wrong-sheet'])('rejects %s before publishing a Table result', async (mode) => {
  const { store, table, project } = await setup()
  const before = store.getter(projectionSnapshotAtom)
  table.mockImplementationOnce(async (input) => {
    const projection = project(input.projection)
    // 模拟越过 TypeScript 的损坏 Worker 回复，验证运行时边界。
    if (mode === 'missing-visibility') delete (projection as Partial<typeof projection>).visibility
    else projection.sheetId = 'foreign'
    return { changed: true, projection }
  })
  expect(await store.setter(configureNativeFilterAtom, 'clear')).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(nativeFilterFeedbackAtom).error).toMatch(/mismatched/)
})
