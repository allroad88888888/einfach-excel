import { expect, test, vi } from 'vitest'
import { filterSelectionWithinBudget } from '../../src/advanced-filter/contracts'
import { validateProjectionResult } from '../../src/projection/contracts'
import { validFilterRules } from '../../src/rust-workbook/filter-commands'
import { changeFilter } from '../../src/rust-workbook/filter-io'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

// This is a valid persisted flat list from before the new UI selection budget.
const values = Array.from({ length: 40 }, (_, index) => `${String(index).padStart(2, '0')}${'x'.repeat(30_000)}`)
const rules = [{ kind: 'list' as const, colIndex: 0, values }]
const range = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 1 }
const projection = { kind: 'visible-window' as const, sheetId: 's', requestId: 1,
  window: range, cells: [] }

test('ordinary projections retain legacy flat lists larger than the new selection budget', () => {
  expect(filterSelectionWithinBudget(values)).toBe(false)
  for (const groupField of [{}, { filterGroups: [] }]) {
    expect(validateProjectionResult({ ...projection, filterRange: range,
      filterRules: rules, ...groupField }).ok).toBe(true)
  }
  expect(validFilterRules(rules)).toBe(true)
})

test('Table projections retain legacy flat lists without requiring a groups migration', () => {
  for (const groupField of [{}, { groups: [] }]) {
    expect(validateProjectionResult({ ...projection, tables: [{
      name: 'Sales', sheet: 'Sheet', sheetIndex: 0, range: 'A1:B10',
      hasHeaders: true, hasTotals: false, columns: ['Region', 'Amount'],
      autoFilter: { rules, ...groupField },
    }] }).ok).toBe(true)
  }
})

test('Worker apply and reapply preserve the legacy flat payload at the existing native boundary', () => {
  const report = { ok: true, hiddenRows: [3] }
  const applyFilter = vi.fn(() => report)
  const reapplyFilter = vi.fn(() => report)
  const workbook = { applyFilter, reapplyFilter, clearFilter: () => report,
    sheet_visibility: () => ({}), history_state: () => ({}), read_sparse_range: () => [],
    snapshot_format_range: () => ({}) } as unknown as WasmWorkbook
  expect(changeFilter(workbook, 0, 2, { action: 'apply', sheetId: 's', rules,
    range, projection })).toBe(1)
  expect(applyFilter).toHaveBeenCalledExactlyOnceWith(0, { rules, range })
  expect(changeFilter(workbook, 0, 2, { action: 'reapply', sheetId: 's', projection })).toBe(1)
  expect(reapplyFilter).toHaveBeenCalledExactlyOnceWith(0)
})

test('legacy flat compatibility does not loosen the original item count or character limits', () => {
  expect(validFilterRules([{ kind: 'list', colIndex: 0, values: Array(1000).fill('x') }])).toBe(true)
  expect(validFilterRules([{ kind: 'list', colIndex: 0, values: ['x'.repeat(32767)] }])).toBe(true)
  for (const invalid of [Array(1001).fill('x'), ['x'.repeat(32768)], [123]]) {
    expect(validFilterRules([{ kind: 'list', colIndex: 0, values: invalid }])).toBe(false)
  }
})
