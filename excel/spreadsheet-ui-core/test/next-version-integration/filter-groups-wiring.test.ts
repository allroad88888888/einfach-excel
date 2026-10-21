import { expect, test, vi } from 'vitest'
import { cloneFilterSortState, filterSortHasEffect } from '../../src/backend/projection-helpers'
import { validateProjectionResult } from '../../src/projection/contracts'
import { snapshotRustWorkbookDefinition } from '../../src/runtime/rust-workbook-definition'
import { changeTable, importTables } from '../../src/rust-workbook/table-commands'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import { validNativeTables } from '../../src/tables/native-types'
import type { ColumnFilterGroup } from '../../src/filter-sort/types'

const values = ['North', 'South']
const groups: ColumnFilterGroup[] = [
  { rules: [{ kind: 'list', colIndex: 0, values }] },
  { rules: [{ kind: 'range', colIndex: 1, min: 20 }] },
]
const range = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 1 }
const table = { name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B10',
  hasHeaders: true, hasTotals: false, columns: ['Region', 'Amount'] }
const projection = { kind: 'visible-window', sheetId: 's', requestId: 1,
  window: range, cells: [] } as const

test('filter state cloning preserves separate OR groups and list ownership', () => {
  const copied = cloneFilterSortState({ rules: [], groups })
  expect(filterSortHasEffect(copied)).toBe(true)
  expect(copied).toEqual({ rules: [], groups })
  expect(copied.groups).not.toBe(groups)
  expect(copied.groups![0].rules[0]).not.toBe(groups[0].rules[0])
  expect(copied.groups![0].rules[0]).toMatchObject({ values: ['North', 'South'] })
  expect(filterSortHasEffect({ rules: [], groups: [] })).toBe(false)
})

test('projection validation preserves groups and rejects mixed or out-of-range conditions', () => {
  expect(validateProjectionResult({ ...projection, filterRange: range,
    filterRules: [], filterGroups: groups }).ok).toBe(true)
  for (const filter of [
    { filterRules: [{ kind: 'equals', colIndex: 0, value: 'North' }], filterGroups: groups },
    { filterGroups: [{ rules: [] }] },
    { filterGroups: [{ rules: [{ kind: 'equals', colIndex: 2, value: 'North' }] }] },
  ]) expect(validateProjectionResult({ ...projection, filterRange: range,
    ...filter } as Parameters<typeof validateProjectionResult>[0]).ok).toBe(false)
})

test('Table projections accept one representation and enforce grouped column bounds', () => {
  expect(validNativeTables([{ ...table, autoFilter: { rules: [], groups } }])).toBe(true)
  for (const autoFilter of [
    { rules: groups[0].rules, groups }, { rules: [], groups: [{ rules: [] }] },
    { rules: [], groups: [{ rules: [{ kind: 'range', colIndex: 2, min: 1 }] }] },
  ]) expect(validNativeTables([{ ...table, autoFilter }])).toBe(false)
})

test('initial Table groups are deeply copied without flattening and reject mixed schemas', () => {
  const definition = { title: 'Groups', sheets: [{ id: 's', name: 'Sheet', rowCount: 100,
    colCount: 8, tables: [{ name: 'Sales', range, filterGroups: groups }] }],
  createImportChunks: () => [] }
  const copied = snapshotRustWorkbookDefinition(definition).sheets[0].tables![0]
  expect(copied.filterRules).toBeUndefined()
  expect(copied.filterGroups).toEqual(groups)
  expect(copied.filterGroups).not.toBe(groups)
  expect(Object.isFrozen(copied.filterGroups![0].rules[0])).toBe(true)
  const copiedValues = (copied.filterGroups![0].rules[0] as { values: string[] }).values
  expect(Object.isFrozen(copiedValues)).toBe(true)
  expect(() => snapshotRustWorkbookDefinition({ ...definition, sheets: [{ ...definition.sheets[0],
    tables: [{ ...definition.sheets[0].tables[0], filterRules: groups[0].rules }] }] }))
    .toThrow('Invalid initial table filter.')
})

test('Table commands and initial import forward groups to one native filter command', () => {
  const change = vi.fn(() => true)
  const workbook = { change_table: change, listTables: () => [], read_sparse_range: () => [],
    snapshot_format_range: () => ({}) } as unknown as WasmWorkbook
  const sheets = new Map([['s', { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 }]])
  const action = { kind: 'filter', name: 'Sales', rules: [], groups } as const
  expect(changeTable(workbook, sheets, { sheetId: 's', action,
    revision: 0, projection }, 0)).toBe(true)
  expect(change).toHaveBeenCalledExactlyOnceWith(0, action)
  change.mockClear()
  importTables(workbook, sheets, [{ sheetId: 's', name: 'Sales', range, filterGroups: groups }])
  expect(change.mock.calls).toEqual([[0, { kind: 'create', name: 'Sales', range: [0, 0, 9, 1] }],
    [0, action]])
  change.mockClear()
  expect(() => changeTable(workbook, sheets, { sheetId: 's', revision: 0, projection,
    action: { ...action, rules: groups[0].rules } }, 0)).toThrow('Choose valid table filter conditions.')
  expect(change).not.toHaveBeenCalled()
})
