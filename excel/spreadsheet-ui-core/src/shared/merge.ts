import type { CellCoord, CellRange } from './types'
import type { DisplayCell } from '../backend/types'

export function isMergeAnchor(cell: DisplayCell): boolean {
  return cell.mergedSpan !== undefined
}

export function isMergeCovered(cell: DisplayCell): boolean {
  return cell.mergeAnchor !== undefined
}

export function getMergeAnchorCoord(cell: DisplayCell): CellCoord | null {
  if (cell.mergeAnchor !== undefined) return cell.mergeAnchor
  if (cell.mergedSpan !== undefined) return { row: cell.row, col: cell.col }
  return null
}

/** 合并几何来自 Rust 投影；覆盖格、锚点用同一次矩形查询定位。 */
export function mergeRangeAt(
  ranges: readonly CellRange[],
  coord: CellCoord,
): CellRange | undefined {
  return ranges.find(
    (r) =>
      coord.row >= r.rowStart &&
      coord.row <= r.rowEnd &&
      coord.col >= r.colStart &&
      coord.col <= r.colEnd,
  )
}
