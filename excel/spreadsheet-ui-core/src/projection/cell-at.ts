import type { DisplayCell, VisibleProjectionResult } from '../backend'
import type { CellCoord } from '../shared'

/** undefined = 尚未投影；null = 已读取的空格。冻结区与滚动区使用同一份响应。 */
export function cellAtProjection(
  result: VisibleProjectionResult,
  coord: CellCoord,
): DisplayCell | null | undefined {
  let known = false
  for (const region of [result, ...(result.frozen?.regions ?? [])]) {
    const matches = (cell: DisplayCell) => cell.row === coord.row && cell.col === coord.col
    const anchor = region.mergeAnchors?.find(matches)
    if (anchor) return anchor
    const w = region.window
    if (
      coord.row < w.rowStart ||
      coord.row > w.rowEnd ||
      coord.col < w.colStart ||
      coord.col > w.colEnd
    )
      continue
    const cell = region.cells.find(matches)
    if (cell) return cell
    known = true
  }
  return known ? null : undefined
}
