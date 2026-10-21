import { vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, selectCellAtom, runVisibleProjectionAtom,
  configureNativeFilterAtom, type RustWorkbookCommands, type RustWorkbookConnection,
  type ColumnFilterGroup, type ColumnFilterRule, type VisibleProjectionRequest,
} from '../../src'

export type FilterInput = RustWorkbookCommands['sheet.filter']['payload']
export type ValuesInput = RustWorkbookCommands['sheet.filterValues']['payload']
export async function setup(scope: 'range' | 'table' = 'range', initialGroups: readonly ColumnFilterGroup[] = []) {
  let revision = 1
  let groups = initialGroups
  let rules: readonly ColumnFilterRule[] = []
  const items = Array.from({ length: 1000 }, (_, index) => `Order ${String(index + 1).padStart(4, '0')}`)
  const page = (input: ValuesInput) => {
    const matching = items.filter((value) =>
      value.toLowerCase().includes(input.search.toLowerCase()))
    return { revision, total: matching.length, offset: Math.min(input.offset, matching.length),
      values: matching.slice(input.offset,
        input.allMatches ? undefined : input.offset + input.limit)
        .map((value) => ({ value, count: 1 })) }
  }
  const values = vi.fn(async (input: ValuesInput) => page(input))
  const project = (request: VisibleProjectionRequest) => ({ ...request, cells: [], revision,
    filterRules: scope === 'range' ? rules : [], filterGroups: scope === 'range' ? groups : [],
    filterRange: { rowStart: 0, rowEnd: 1000, colStart: 0, colEnd: 3 },
    tables: scope === 'table' ? [{ name: 'Orders', range: 'A1:D1001', sheetIndex: 0, sheet: 'Sheet',
      columns: ['Order', 'Region', 'Qty', 'Total'], hasHeaders: true, hasTotals: false,
      ...(rules.length || groups.length ? { autoFilter: { rules, groups } } : {}) }] : [],
    visibility: { manualRows: [20], manualColumns: [], filterRows: [] },
  })
  const filter = vi.fn(async (input: FilterInput) => {
    if (input.action === 'apply') {
      groups = input.groups ?? []; rules = input.rules
    } else if (input.action === 'clear') { groups = []; rules = [] }
    revision++
    return { hiddenRows: 0, projection: project(input.projection) }
  })
  const table = vi.fn(async (input: RustWorkbookCommands['table.change']['payload']) => {
    if (input.action.kind === 'filter') { groups = input.action.groups ?? []; rules = input.action.rules }
    revision++
    return { changed: true, projection: project(input.projection) }
  })
  const request = (async (command: string, input: unknown) => command === 'sheet.filter' ? filter(input as FilterInput)
    : command === 'sheet.filterValues' ? values(input as ValuesInput)
      : command === 'table.change' ? table(input as RustWorkbookCommands['table.change']['payload'])
        : project((input as { request: VisibleProjectionRequest }).request)) as RustWorkbookConnection['request']
  const { store } = createSpreadsheetUi({ connection: { request, dispose() {} } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', index: 0, rowCount: 1100, colCount: 8 }] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  const refresh = () => store.setter(runVisibleProjectionAtom, { sheetId: 's',
    window: { rowStart: 0, rowEnd: 19, colStart: 0, colEnd: 7 } })
  await refresh()
  await store.setter(configureNativeFilterAtom, 'open')
  return { store, filter, table, values, page, refresh, changeRevision: () => revision++ }
}
