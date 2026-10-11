import { atom } from '@einfach/core'
import { workbookDocumentAtom, type WorkbookDocumentSheet } from './workbook-document'
import { selectCellAtom, setMultiRegionSelectionAtom, setSelectionBoundsAtom } from '../selection'
import { viewportMetricsAtom } from '../viewport/metrics'
import { activateSheetTabAtom } from '../sheet-tabs/basic-commands'
import { sheetViewsBackingAtom } from './sheet-view-state'

/** 切表只保存 UI 位置；原生数据仍由既有可见投影读取。首次访问从 A1 开始。 */
export const activateWorkbookSheetAtom = atom(
  null,
  (get, set, sheet: WorkbookDocumentSheet, options: { reference?: boolean } = {}): void => {
    const metrics = get(viewportMetricsAtom)
    const selection = get(setMultiRegionSelectionAtom)
    const previousId = selection.regions[selection.primaryIndex]?.sheetId
    const memory = get(sheetViewsBackingAtom)
    const views = memory.views
    let nextViews = views
    if (previousId === sheet.id && metrics.sheetId === sheet.id && !memory.referenceBrowsing) return
    // 结构命令可能已删除当前表；不得在切往邻表时把已回收的记忆重新存回去。
    if (!memory.referenceBrowsing && previousId && previousId !== sheet.id &&
      get(workbookDocumentAtom).sheets.some((item) => item.id === previousId)) {
      nextViews = { ...views, [previousId]: {
        selection,
        scrollTop: metrics.sheetId === previousId ? metrics.scrollTop : 0,
        scrollLeft: metrics.sheetId === previousId ? metrics.scrollLeft : 0,
      } }
    }
    set(sheetViewsBackingAtom, { views: nextViews, referenceBrowsing: options.reference ?? false })
    const remembered = views[sheet.id]
    set(setSelectionBoundsAtom, { rowCount: sheet.rowCount, colCount: sheet.colCount })
    set(activateSheetTabAtom, { sheetId: sheet.id })
    if (remembered) set(setMultiRegionSelectionAtom, remembered.selection)
    else set(selectCellAtom, { sheetId: sheet.id, coord: { row: 0, col: 0 }, extend: false })
    // 表与画布尺寸同步切换，返回离屏编辑源也无需等 React 再补一轮旧尺寸。
    // 旧表面积不能裁剪新表记住的位置（大纲栏可不同）；交给新表的 DOM 测量裁剪。
    set(viewportMetricsAtom, {
      ...metrics, sheetId: sheet.id,
      rowCount: sheet.rowCount, colCount: sheet.colCount,
      scrollTop: remembered?.scrollTop ?? 0, scrollLeft: remembered?.scrollLeft ?? 0,
    })
  },
)
