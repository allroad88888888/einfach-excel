import type { Getter, Setter } from '@einfach/core'
import type { CellCoord } from '../shared'
import type { WorkbookDocumentSheet } from '../runtime/workbook-document'
import { selectCellAtom } from '../selection'
import { viewportGeometrySizesAtom } from './geometry-sizes'
import { scrollToCellAtom } from './metrics'

/** 隐藏或折叠活动格后选择最近可见格；全隐藏时保留坐标，供展开操作恢复。 */
export function revealVisibleSelection(
  get: Getter,
  set: Setter,
  sheet: WorkbookDocumentSheet,
  current: CellCoord,
) {
  const geometry = get(viewportGeometrySizesAtom)
  const nextIndex = (start: number, count: number, sizes: Record<string, number> | undefined) => {
    for (let index = start; index < count; index++) if (sizes?.[index] !== 0) return index
    for (let index = start - 1; index >= 0; index--) if (sizes?.[index] !== 0) return index
    return start
  }
  const coord = {
    row: nextIndex(current.row, sheet.rowCount, geometry.rowHeightsBySheet[sheet.id]),
    col: nextIndex(current.col, sheet.colCount, geometry.colWidthsBySheet[sheet.id]),
  }
  if (coord.row !== current.row || coord.col !== current.col)
    set(selectCellAtom, { sheetId: sheet.id, coord })
  set(scrollToCellAtom, { coord })
}
