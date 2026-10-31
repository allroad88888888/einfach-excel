import type { CellCoord, CellRange } from '../shared'

/** 指针按下时在来源区内抓住的格，相对来源左上角的偏移。 */
export function dragMoveGrabOffset(source: CellRange, coord: CellCoord): CellCoord {
  const row = Math.min(source.rowEnd, Math.max(source.rowStart, coord.row))
  const col = Math.min(source.colEnd, Math.max(source.colStart, coord.col))
  return { row: row - source.rowStart, col: col - source.colStart }
}

/** 被抓住的格跟随指针，整块尺寸不变，并整体夹在工作表内。 */
export function dragMoveTargetRange(
  source: CellRange,
  grab: CellCoord,
  pointer: CellCoord,
  bounds: { readonly rowCount: number; readonly colCount: number },
): CellRange {
  const height = source.rowEnd - source.rowStart
  const width = source.colEnd - source.colStart
  const rowStart = Math.max(0, Math.min(bounds.rowCount - 1 - height, pointer.row - grab.row))
  const colStart = Math.max(0, Math.min(bounds.colCount - 1 - width, pointer.col - grab.col))
  return { rowStart, colStart, rowEnd: rowStart + height, colEnd: colStart + width }
}
