// 一句话：排序前把区域格式图层落成逐格格式再切开。

import type {
  CellRange,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneFormat,
  getEffectiveFormat,
  keyFor,
  normalizeRange,
  rangesIntersect,
} from '@einfach/spreadsheet-ui-core'

/** Intersection of two normalized, intersecting rectangles. */
function intersectSortRange(a: CellRange, b: CellRange): CellRange {
  return {
    rowStart: Math.max(a.rowStart, b.rowStart),
    rowEnd: Math.min(a.rowEnd, b.rowEnd),
    colStart: Math.max(a.colStart, b.colStart),
    colEnd: Math.min(a.colEnd, b.colEnd),
  }
}

/**
 * Geometric subtraction `a \ b` for normalized, intersecting rectangles: up to
 * four disjoint pieces (top band, bottom band, left/middle, right/middle) that
 * tile `a` minus `b` exactly. Mirrors Rust `subtract_range` (design §5.3).
 */
function subtractSortRange(a: CellRange, b: CellRange): CellRange[] {
  const out: CellRange[] = []
  if (a.rowStart < b.rowStart) {
    out.push({
      rowStart: a.rowStart,
      rowEnd: b.rowStart - 1,
      colStart: a.colStart,
      colEnd: a.colEnd,
    })
  }
  if (a.rowEnd > b.rowEnd) {
    out.push({ rowStart: b.rowEnd + 1, rowEnd: a.rowEnd, colStart: a.colStart, colEnd: a.colEnd })
  }
  const midR0 = Math.max(a.rowStart, b.rowStart)
  const midR1 = Math.min(a.rowEnd, b.rowEnd)
  if (midR0 <= midR1) {
    if (a.colStart < b.colStart) {
      out.push({ rowStart: midR0, rowEnd: midR1, colStart: a.colStart, colEnd: b.colStart - 1 })
    }
    if (a.colEnd > b.colEnd) {
      out.push({ rowStart: midR0, rowEnd: midR1, colStart: b.colEnd + 1, colEnd: a.colEnd })
    }
  }
  return out
}

/**
 * Format-layer preprocessing (design §5.3): materialize the effective format of
 * every layer-covered cell inside `range` as a per-cell entry, then cut every
 * intersecting layer so no layer overlaps `range`. Afterwards "default = no
 * entry" holds inside the range and moving per-cell formats with their rows is
 * the complete, correct format-follows-row semantics.
 */
export function materializeAndCutSortFormatLayers(
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: RangeFormatLayer[],
  range: CellRange,
): void {
  const intersecting = rangeFormats.filter((layer) => rangesIntersect(layer.range, range))
  if (intersecting.length === 0) return

  const seen = new Set<string>()
  for (const layer of intersecting) {
    const region = intersectSortRange(normalizeRange(layer.range), range)
    for (let row = region.rowStart; row <= region.rowEnd; row += 1) {
      for (let col = region.colStart; col <= region.colEnd; col += 1) {
        const key = keyFor(row, col)
        if (seen.has(key)) continue
        seen.add(key)
        if (cellFormats.has(key)) continue
        // `getEffectiveFormat` resolves per-cell > topmost covering layer and
        // returns undefined for a default effective format (which stays absent).
        const effective = getEffectiveFormat(row, col, cellFormats, rangeFormats)
        if (effective) cellFormats.set(key, effective)
      }
    }
  }

  const next: RangeFormatLayer[] = []
  for (const layer of rangeFormats) {
    if (!rangesIntersect(layer.range, range)) {
      next.push(layer)
      continue
    }
    for (const piece of subtractSortRange(normalizeRange(layer.range), range)) {
      next.push({ range: piece, format: cloneFormat(layer.format) })
    }
  }
  rangeFormats.length = 0
  for (const layer of next) rangeFormats.push(layer)
}
