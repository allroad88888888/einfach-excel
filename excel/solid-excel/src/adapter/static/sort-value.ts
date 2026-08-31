// 一句话：把 DisplayCell 投到 Excel 的五个排序类。

import type { DisplayCell, SortRangeKey } from '@einfach/spreadsheet-ui-core'
import type { ResolvedSortKey, SortValue } from '../sort-order'
import type { EvalCellLookup } from '../static-formula-eval'
import { evaluateFormula } from '../static-formula-eval'

export function toResolvedSortKeys(keys: readonly SortRangeKey[]): ResolvedSortKey[] {
  return keys.map((key) => ({
    col: key.col,
    direction: key.direction ?? 'asc',
    caseSensitive: key.caseSensitive ?? false,
  }))
}

/**
 * Project a static `DisplayCell` onto the five Excel sort classes, matching the
 * engine `Value` the WASM path sees (parity golden fixture): formulas sort by
 * their evaluated result, `#…` results are the error class, a missing / blank
 * cell is empty. This keeps a static-host sort cell-for-cell identical with the
 * engine sort for the same data.
 */
export function cellToSortValue(cell: DisplayCell | undefined, lookup: EvalCellLookup): SortValue {
  if (!cell) return { kind: 'empty' }
  if (cell.formula) {
    const result = evaluateFormula(cell.formula, lookup, new Set(), {
      row: cell.row,
      col: cell.col,
    })
    if (typeof result === 'number') return { kind: 'number', value: result }
    // A string result beginning with '#' is an error code; anything else is text.
    return result.startsWith('#') ? { kind: 'error' } : { kind: 'text', value: result }
  }
  switch (cell.valueKind) {
    case 'number': {
      const value = Number.isFinite(cell.numericValue)
        ? cell.numericValue!
        : Number(cell.displayValue)
      return { kind: 'number', value }
    }
    case 'boolean':
      return { kind: 'boolean', value: cell.displayValue === 'TRUE' }
    case 'error':
      return { kind: 'error' }
    case 'blank':
      return { kind: 'empty' }
    default:
      return cell.displayValue === ''
        ? { kind: 'empty' }
        : { kind: 'text', value: cell.displayValue }
  }
}
