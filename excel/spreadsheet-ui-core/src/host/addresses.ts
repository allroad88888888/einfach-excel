import type { CellCoord, CellRange } from '../shared'
import { coordToA1 as label } from '../name-box/address'
export { parseA1Cell, parseA1Range } from '../name-box/address'

export function coordToA1(coord: CellCoord): string {
  if (!coord || !Number.isSafeInteger(coord.row) || !Number.isSafeInteger(coord.col)
    || coord.row < 0 || coord.row >= 1_048_576 || coord.col < 0 || coord.col >= 16_384)
    throw new Error('INVALID_COORDINATE')
  return label(coord)
}
export function rangeToA1(range: CellRange): string {
  if (!range || range.rowStart > range.rowEnd || range.colStart > range.colEnd)
    throw new Error('INVALID_RANGE')
  const start = coordToA1({ row: range.rowStart, col: range.colStart })
  const end = coordToA1({ row: range.rowEnd, col: range.colEnd })
  return start === end ? start : `${start}:${end}`
}
