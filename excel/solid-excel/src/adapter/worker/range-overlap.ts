// 一句话：判断两个 CellRange 是否相交。

import type { CellRange } from '@einfach/spreadsheet-ui-core'

export function rangesIntersect(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart <= right.rowEnd &&
    left.rowEnd >= right.rowStart &&
    left.colStart <= right.colEnd &&
    left.colEnd >= right.colStart
  )
}
