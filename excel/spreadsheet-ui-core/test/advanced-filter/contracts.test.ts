import { expect, test, vi } from 'vitest'
import { validFilterGroups, filterSelectionWithinBudget } from '../../src/advanced-filter/contracts'
import { readFilterValues, changeFilter } from '../../src/rust-workbook/filter-io'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'
import { validFilterRules } from '../../src/rust-workbook/filter-commands'
import { filterDatePeriods } from '../../src/filter/rule-types'

test('date periods accept only the closed native calendar options in flat and grouped rules', () => {
  for (const period of filterDatePeriods) {
    const rule = { kind: 'date-period', colIndex: 1, period }
    expect(validFilterRules([rule])).toBe(true)
    expect(validFilterGroups([{ rules: [rule] }])).toBe(true)
  }
  for (const period of ['thisMonth', 'quarter-1', '', 1, null, undefined]) {
    const rule = { kind: 'date-period', colIndex: 1, period }
    expect(validFilterRules([rule])).toBe(false)
    expect(validFilterGroups([{ rules: [rule] }])).toBe(false)
  }
  expect(validFilterRules([{ kind: 'date-period', colIndex: 16384, period: 'today' }])).toBe(false)
})

test('typed ranks enforce identical flat and grouped amount contracts', () => {
  const top = { kind: 'top', colIndex: 1, direction: 'top', unit: 'items', value: 10 }
  for (const rule of [top, { ...top, value: 500 },
    { ...top, direction: 'bottom', unit: 'percent', value: 100 }]) {
    expect(validFilterRules([rule])).toBe(true)
    expect(validFilterGroups([{ rules: [rule] }])).toBe(true)
  }
  for (const patch of [{ value: 0 }, { value: 501 }, { value: 1.5 }, { value: NaN },
    { value: Infinity }, { value: '10' }, { unit: 'percent', value: 101 },
    { direction: 'sideways' }, { unit: 'rows' }]) {
    expect(validFilterRules([{ ...top, ...patch }])).toBe(false)
    expect(validFilterGroups([{ rules: [{ ...top, ...patch }] }])).toBe(false)
  }
})

test('two-level groups reject empty, nested, excessive, nonnumeric and oversized criteria', () => {
  const equals = { kind: 'equals', colIndex: 0, value: 'x' }
  expect(validFilterGroups([])).toBe(true)
  expect(validFilterGroups([{ rules: [equals, equals] }])).toBe(true)
  for (const invalid of [[{ rules: [] }], [{ groups: [{ rules: [equals] }] }],
    Array.from({ length: 9 }, () => ({ rules: [equals] })), [{ rules: Array(9).fill(equals) }],
    [{ rules: [{ kind: 'range', colIndex: 0, min: Number.NaN }] }],
    [{ rules: [{ ...equals, colIndex: 8 }] }]]) expect(validFilterGroups(invalid, 8)).toBe(false)
  expect(filterSelectionWithinBudget(Array(40).fill('x'.repeat(30_000)))).toBe(false)
})

test('new groups retain their list selection budget and total retained-byte budget', () => {
  const list = { kind: 'list' as const, colIndex: 0,
    values: Array.from({ length: 34 }, (_, index) => `${index}${'x'.repeat(30_000)}`) }
  expect(validFilterGroups([{ rules: [list] }])).toBe(true)
  expect(validFilterGroups([{ rules: [{ ...list, values: Array(40).fill('x'.repeat(30_000)) }] }])).toBe(false)
  const first = { rules: Array(8).fill(list) }
  expect(validFilterGroups([first])).toBe(true)
  expect(validFilterGroups([first, { rules: [list] }])).toBe(false)
})

test('the existing worker value query forwards complete membership as one bounded native request', () => {
  const filter_values = vi.fn(() => ({ values: [], total: 0, offset: 0 }))
  const workbook = { filter_values } as unknown as WasmWorkbook
  const sheet = { id: 's', index: 0, name: 'Sheet', rowCount: 1000, colCount: 4 }
  const input = { sheetId: 's', expectedRevision: 3, column: 0, search: 'order', offset: 0, limit: 50, allMatches: true }
  expect(readFilterValues(workbook, sheet, input, 3)).toMatchObject({ revision: 3, total: 0 })
  expect(filter_values).toHaveBeenCalledExactlyOnceWith({ sheet: 0, column: 0, search: 'order', offset: 0, limit: 50, allMatches: true })
  expect(() => readFilterValues(workbook, sheet, { ...input, offset: 50 }, 3)).toThrow('valid')
})

test('worker rejects mixing flat and grouped representations before native history is touched', () => {
  const applyFilter = vi.fn()
  const workbook = { applyFilter } as unknown as WasmWorkbook
  const rules = [{ kind: 'equals' as const, colIndex: 0, value: 'x' }]
  expect(() => changeFilter(workbook, 0, 4, { action: 'apply', sheetId: 's', rules,
    groups: [{ rules }], projection: { sheetId: 's' } as never })).toThrow('valid')
  expect(applyFilter).not.toHaveBeenCalled()
})
