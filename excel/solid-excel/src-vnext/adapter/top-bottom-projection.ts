// 一句话：把 Top/Bottom 规则的完整范围数值排名投影成命中坐标。

import type {
  ConditionalFormatRuleEntry,
  DisplayCell,
  TopBottomRule,
} from '@einfach/spreadsheet-ui-core'
import { isCoordInsideRange, keyFor } from '@einfach/spreadsheet-ui-core'

export type TopBottomMatches = ReadonlyMap<string, ReadonlySet<string>>

interface RankedCell {
  readonly row: number
  readonly col: number
  readonly value: number
}

type TopBottomEntry = ConditionalFormatRuleEntry & { readonly rule: TopBottomRule }

/** Top/Bottom consumes canonical numeric projections only, never formatted text. */
export function topBottomNumericValue(cell: DisplayCell | undefined): number | null {
  return typeof cell?.numericValue === 'number' && Number.isFinite(cell.numericValue)
    ? cell.numericValue
    : null
}

/**
 * Each rule ranks every finite number in its complete canonical scope. Equal
 * values break by source row then source column, making a cut-off deterministic.
 */
export function collectTopBottomMatches(
  entries: readonly ConditionalFormatRuleEntry[],
  cells: Iterable<DisplayCell>,
): Map<string, Set<string>> {
  const topBottoms = entries.filter(isTopBottomEntry)
  const rankedByRule = new Map<string, RankedCell[]>()
  for (const entry of topBottoms) rankedByRule.set(entry.id, [])

  for (const cell of cells) {
    const value = topBottomNumericValue(cell)
    if (value === null) continue
    for (const entry of topBottoms) {
      if (isCoordInsideRange(cell.row, cell.col, entry.scope.range)) {
        rankedByRule.get(entry.id)?.push({ row: cell.row, col: cell.col, value })
      }
    }
  }

  const matches = new Map<string, Set<string>>()
  for (const entry of topBottoms) {
    const ranked = rankedByRule.get(entry.id) ?? []
    const count = topBottomMatchCount(entry.rule, ranked.length)
    matches.set(
      entry.id,
      new Set(
        ranked
          .sort((left, right) => compareRankedCells(left, right, entry.rule.direction))
          .slice(0, count)
          .map((cell) => keyFor(cell.row, cell.col)),
      ),
    )
  }
  return matches
}

function isTopBottomEntry(entry: ConditionalFormatRuleEntry): entry is TopBottomEntry {
  return entry.rule.kind === 'top-bottom'
}

function topBottomMatchCount(rule: TopBottomRule, population: number): number {
  if (!Number.isSafeInteger(rule.count) || rule.count <= 0 || population === 0) return 0
  const requested = rule.percent
    ? Math.ceil((population * Math.min(rule.count, 100)) / 100)
    : rule.count
  return Math.min(population, requested)
}

function compareRankedCells(
  left: RankedCell,
  right: RankedCell,
  direction: TopBottomRule['direction'],
): number {
  if (left.value !== right.value) {
    if (direction === 'top') return left.value > right.value ? -1 : 1
    return left.value < right.value ? -1 : 1
  }
  return left.row === right.row ? left.col - right.col : left.row - right.row
}
