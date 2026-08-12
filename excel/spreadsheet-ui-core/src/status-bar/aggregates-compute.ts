import type { DisplayCell } from '../backend'
import type { CellRange } from '../shared'
import { getSelectionRange, type SelectionBounds, type SelectionState } from '../selection'
import type { SelectionAggregates } from './types'

/** Pure aggregate arithmetic over display cells. No atoms, no host state. */

export const EMPTY_AGGREGATES: SelectionAggregates = Object.freeze({
  sum: 0,
  average: 0,
  count: 0,
  numericCount: 0,
  min: 0,
  max: 0,
  truncated: false,
})

/**
 * Hard upper bound for point-in-selection checks during one aggregate
 * derivation. Kept separate from the projection cell cap because it bounds a
 * different resource: with many selection regions the check count is
 * O(cells × regions), and an unbounded walk stalls the main thread.
 */
export const STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX = 50_000

export interface NormalizedSelectionRange {
  readonly sheetId: string
  readonly range: CellRange
}

export function normalizeSelectionRanges(
  regions: readonly SelectionState[],
  bounds: SelectionBounds,
): readonly NormalizedSelectionRange[] {
  const ranges: NormalizedSelectionRange[] = []
  for (const region of regions) {
    const range = getSelectionRange(region, bounds)
    if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) continue
    ranges.push({ sheetId: region.sheetId, range })
  }
  return ranges
}

export function rangeContains(outer: CellRange, inner: CellRange): boolean {
  return (
    outer.rowStart <= inner.rowStart &&
    outer.rowEnd >= inner.rowEnd &&
    outer.colStart <= inner.colStart &&
    outer.colEnd >= inner.colEnd
  )
}

function isInRange(
  row: number,
  col: number,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): boolean {
  return row >= rowStart && row <= rowEnd && col >= colStart && col <= colEnd
}

function isNonEmpty(cell: DisplayCell): boolean {
  if (cell.valueKind === undefined) {
    return cell.displayValue.length > 0
  }
  return cell.valueKind !== 'blank'
}

function parseNumeric(cell: DisplayCell): number | null {
  if (cell.valueKind !== 'number' || !Number.isFinite(cell.numericValue)) {
    return null
  }
  return cell.numericValue!
}

export function computeSelectionAggregatesFromRanges(
  cells: readonly DisplayCell[],
  ranges: readonly CellRange[],
  options: { truncated?: boolean } = {},
): SelectionAggregates {
  if (ranges.length === 0 || cells.length === 0) {
    return options.truncated
      ? Object.freeze({ ...EMPTY_AGGREGATES, truncated: true })
      : EMPTY_AGGREGATES
  }

  let count = 0
  let numericCount = 0
  let sum = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let membershipChecks = 0
  let membershipBudgetExhausted = false
  let numericProjectionIncomplete = false

  cellLoop: for (const cell of cells) {
    let selected = false
    for (const range of ranges) {
      // Check before consuming work. Reaching the exact limit on the final
      // required comparison is complete work, not truncation; only a further
      // required comparison exhausts the budget.
      if (membershipChecks >= STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX) {
        membershipBudgetExhausted = true
        break cellLoop
      }
      membershipChecks += 1
      if (
        isInRange(cell.row, cell.col, range.rowStart, range.rowEnd, range.colStart, range.colEnd)
      ) {
        selected = true
        break
      }
    }
    if (!selected) continue
    if (!isNonEmpty(cell)) {
      continue
    }
    count += 1
    const numeric = parseNumeric(cell)
    if (numeric === null) {
      if (cell.valueKind === 'number') numericProjectionIncomplete = true
      continue
    }
    numericCount += 1
    sum += numeric
    if (numeric < min) {
      min = numeric
    }
    if (numeric > max) {
      max = numeric
    }
  }

  const average = numericCount > 0 ? sum / numericCount : 0

  return Object.freeze({
    sum,
    average,
    count,
    numericCount,
    min: numericCount > 0 ? min : 0,
    max: numericCount > 0 ? max : 0,
    truncated:
      Boolean(options.truncated) || membershipBudgetExhausted || numericProjectionIncomplete,
  })
}

/**
 * Pure derivation of selection aggregates over the supplied display cells.
 * Cells outside any selection region are ignored. `truncated` is propagated
 * from the caller (e.g. when the visible projection window doesn't fully
 * cover the selection).
 */
export function computeSelectionAggregates(
  cells: readonly DisplayCell[],
  regions: readonly SelectionState[],
  bounds: SelectionBounds,
  options: { truncated?: boolean } = {},
): SelectionAggregates {
  const ranges = normalizeSelectionRanges(regions, bounds).map((entry) => entry.range)
  return computeSelectionAggregatesFromRanges(cells, ranges, options)
}
