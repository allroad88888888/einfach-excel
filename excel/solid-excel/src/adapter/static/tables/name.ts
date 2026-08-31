// 一句话：Excel Table 名字的合法性判定与自动命名。

import type { TableMutationRejectionCode } from '@einfach/spreadsheet-ui-core'
import { ENGINE_BUILTIN_FORMULA_NAMES } from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from '../state'

const TABLE_RESERVED_NAMES: ReadonlySet<string> = new Set(ENGINE_BUILTIN_FORMULA_NAMES)

const GRID_MAX_COL = 16_383
const GRID_MAX_ROW = 1_048_575

function tableColumnLabelToIndex(label: string): number {
  let result = 0
  for (let i = 0; i < label.length; i += 1) {
    result = result * 26 + (label.charCodeAt(i) - 64)
  }
  return result - 1
}

/**
 * Is `name` an in-grid A1 cell reference (`AB12`)? Grid-bounded so an
 * out-of-grid pseudo-ref like `Table1` (column `TABLE`, past `XFD`) is NOT
 * treated as a cell reference — mirrors the engine `name_is_cell_ref_like`.
 */
function looksLikeCellRef(name: string): boolean {
  const match = /^([A-Za-z]+)([0-9]+)$/.exec(name)
  if (!match) return false
  const col = tableColumnLabelToIndex(match[1].toUpperCase())
  const row = Number(match[2]) - 1
  return col >= 0 && col <= GRID_MAX_COL && row >= 0 && row <= GRID_MAX_ROW
}

function namedRangeKeyExists(state: StaticBackendState, key: string): boolean {
  return state.namedRanges.some((entry) => entry.name.toUpperCase() === key)
}

/**
 * Full Table name mutex (design §4.2). Returns a structured rejection code or
 * `null` when the name is admissible. `excludeKey` is the uppercased key of a
 * Table being renamed (so a case-only rename never collides with itself).
 */
export function validateTableName(
  state: StaticBackendState,
  name: string,
  excludeKey: string | null,
): TableMutationRejectionCode | null {
  if (name.length < 1 || name.length > 255 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return 'invalid-name'
  }
  const key = name.toUpperCase()
  if (TABLE_RESERVED_NAMES.has(key)) return 'reserved-name'
  if (looksLikeCellRef(name)) return 'name-like-cell-ref'
  const collidesTable = excludeKey
    ? key !== excludeKey && state.tablesByKey.has(key)
    : state.tablesByKey.has(key)
  if (collidesTable) return 'name-conflict'
  // Shared workbook namespace with defined names (design §4.2).
  if (namedRangeKeyExists(state, key)) return 'name-conflict'
  return null
}

/** First free `Table1`, `Table2`, … not used by a Table or a defined name. */
export function nextAutoTableName(state: StaticBackendState): string {
  let n = 1
  for (;;) {
    const candidate = `Table${n}`
    const key = candidate.toUpperCase()
    if (!state.tablesByKey.has(key) && !namedRangeKeyExists(state, key)) return candidate
    n += 1
  }
}

/** Next `ColumnN` not already present in `used` (uppercased keys). */
export function nextAutoColumnName(used: ReadonlySet<string>): string {
  let n = 1
  for (;;) {
    const candidate = `Column${n}`
    if (!used.has(candidate.toUpperCase())) return candidate
    n += 1
  }
}
