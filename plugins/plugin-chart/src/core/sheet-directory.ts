import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '@einfach-excel/spreadsheet-ui-core'
import type { SheetDirectory } from './range-text'

/** 当前表的图表用来解析与显示跨表区域文本（如 Data!A1:B5）的工作表目录。 */
export const activeSheetDirectoryAtom = atom((get): SheetDirectory => ({
  sheets: get(workbookDocumentAtom).sheets,
  ownerId: get(activeWorkbookSheetAtom)?.id ?? '',
}))
activeSheetDirectoryAtom.debugLabel = 'plugin.chart.sheetDirectory'
