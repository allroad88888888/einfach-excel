// 一句话：把 CellRange 与 A1 地址翻译成 worker 协议坐标。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import type { SortRangeBoundsWire, SparseRangeWire } from '../worker-protocol'

export function parseA1(addr: string): { row: number; col: number } | null {
  const match = addr.toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match) {
    return null
  }

  let col = 0
  for (let index = 0; index < match[1].length; index += 1) {
    col = col * 26 + (match[1].charCodeAt(index) - 64)
  }

  const row = Number(match[2]) - 1
  if (!Number.isInteger(row) || row < 0) {
    return null
  }

  return {
    row,
    col: col - 1,
  }
}

export function toSparseRange(sheet: number, range: CellRange): SparseRangeWire {
  return {
    sheet,
    startRow: range.rowStart,
    startCol: range.colStart,
    endRow: range.rowEnd,
    endCol: range.colEnd,
  }
}

/** CellRange → the 0-based bounds object the `sortRange` payload accepts. */
export function toSortRangeBounds(range: CellRange): SortRangeBoundsWire {
  return {
    startRow: range.rowStart,
    startCol: range.colStart,
    endRow: range.rowEnd,
    endCol: range.colEnd,
  }
}
