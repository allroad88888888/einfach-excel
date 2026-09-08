import { atom } from '@einfach/core'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { selectCellAtom } from '../selection'
import { scrollToCellAtom, setViewportMetricsAtom, viewportMetricsAtom } from '../viewport/metrics'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import type { RustFindMatch } from '../rust-workbook/find-commands'

/** 匹配位置复用选区与滚动几何；不在 React 里计算另一份行列坐标。 */
export const navigateFindMatchAtom = atom(null, (get, set, match: RustFindMatch): string | null => {
  const sheet = get(workbookDocumentAtom).sheets.find((item) => item.id === match.sheetId)
  if (!sheet || match.row >= sheet.rowCount || match.col >= sheet.colCount)
    throw new Error('The matched cell is outside the current worksheet.')
  if (get(activeWorkbookSheetAtom)?.id !== sheet.id) {
    set(activateWorkbookSheetAtom, sheet)
    set(setViewportMetricsAtom, {
      ...get(viewportMetricsAtom),
      sheetId: sheet.id,
      rowCount: sheet.rowCount,
      colCount: sheet.colCount,
      scrollTop: 0,
      scrollLeft: 0,
    })
  }
  const coord = { row: match.row, col: match.col }
  set(selectCellAtom, { sheetId: sheet.id, coord })
  set(scrollToCellAtom, { coord, rowAlign: 'start', colAlign: 'nearest' })
  const sizes = get(viewportGeometrySizesAtom)
  return sizes.rowHeightsBySheet[sheet.id]?.[String(match.row)] === 0 ||
    sizes.colWidthsBySheet[sheet.id]?.[String(match.col)] === 0
    ? 'This match is in a hidden row or column. Unhide it to view the cell.'
    : null
})
