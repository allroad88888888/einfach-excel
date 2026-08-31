// 一句话：合并区 overlay 的投影注入与结构位移。

import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import { isCoordInsideRange, keyFor } from '@einfach/spreadsheet-ui-core'
import { rangesIntersect } from './range-overlap'

/**
 * Parity #04 — merge metadata joins the projection last, in SOURCE
 * coordinates. Mirrors the static backend's `applyMergeMetadata`: the
 * anchor cell (when inside the window) carries `mergedSpan`, and every
 * other covered coordinate inside the window materializes (as a blank
 * cell if needed) carrying `mergeAnchor`. Cells are per-read objects on
 * this adapter, so in-place mutation cannot leak into caches.
 */
export function applyMergeOverlay(
  cells: DisplayCell[],
  projectionRange: CellRange,
  mergeRanges: readonly CellRange[],
): DisplayCell[] {
  if (mergeRanges.length === 0) return cells
  const byCoord = new Map<string, DisplayCell>()
  for (const cell of cells) byCoord.set(keyFor(cell.row, cell.col), cell)

  const upsert = (row: number, col: number): DisplayCell => {
    const key = keyFor(row, col)
    let cell = byCoord.get(key)
    if (!cell) {
      cell = { row, col, displayValue: '', valueKind: 'blank' }
      byCoord.set(key, cell)
    }
    return cell
  }

  let touched = false
  for (const mergeRange of mergeRanges) {
    if (!rangesIntersect(mergeRange, projectionRange)) continue
    touched = true

    if (isCoordInsideRange(mergeRange.rowStart, mergeRange.colStart, projectionRange)) {
      const anchor = upsert(mergeRange.rowStart, mergeRange.colStart)
      delete anchor.mergeAnchor
      anchor.mergedSpan = {
        rows: mergeRange.rowEnd - mergeRange.rowStart + 1,
        cols: mergeRange.colEnd - mergeRange.colStart + 1,
      }
    }

    const rowStart = Math.max(mergeRange.rowStart, projectionRange.rowStart)
    const rowEnd = Math.min(mergeRange.rowEnd, projectionRange.rowEnd)
    const colStart = Math.max(mergeRange.colStart, projectionRange.colStart)
    const colEnd = Math.min(mergeRange.colEnd, projectionRange.colEnd)
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        if (row === mergeRange.rowStart && col === mergeRange.colStart) continue
        const covered = upsert(row, col)
        delete covered.mergedSpan
        covered.mergeAnchor = { row: mergeRange.rowStart, col: mergeRange.colStart }
      }
    }
  }
  return touched ? [...byCoord.values()] : cells
}

/**
 * W3 structural displacement for the #04 merge overlay — Excel
 * semantics, ported from the static backend's `shiftMergeRanges`: an
 * insert before a merge shifts it whole, an insert strictly inside
 * extends it; a delete before it shifts it back, a partial overlap
 * shrinks it, and a delete covering the whole merge removes it. A merge
 * that shrinks to a single cell stops being a merge (a 1x1 "merge" is
 * meaningless in Excel). Mutates `ranges` in place.
 */
export function shiftMergeRangeList(
  ranges: CellRange[],
  axis: 'row' | 'column',
  index: number,
  count: number,
  direction: 1 | -1,
): void {
  const startKey = axis === 'row' ? 'rowStart' : 'colStart'
  const endKey = axis === 'row' ? 'rowEnd' : 'colEnd'
  const deleteEnd = index + count - 1

  for (let rangeIndex = ranges.length - 1; rangeIndex >= 0; rangeIndex -= 1) {
    const range = ranges[rangeIndex]
    const start = range[startKey]
    const end = range[endKey]

    if (direction === 1) {
      if (start >= index) {
        range[startKey] = start + count
        range[endKey] = end + count
      } else if (end >= index) {
        range[endKey] = end + count
      }
      continue
    }

    if (end < index) continue
    if (start > deleteEnd) {
      range[startKey] = start - count
      range[endKey] = end - count
      continue
    }

    const hasBefore = start < index
    const hasAfter = end > deleteEnd
    if (!hasBefore && !hasAfter) {
      ranges.splice(rangeIndex, 1)
      continue
    }

    range[startKey] = hasBefore ? start : index
    range[endKey] = hasAfter ? end - count : index - 1
    if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) {
      ranges.splice(rangeIndex, 1)
    }
  }
}
