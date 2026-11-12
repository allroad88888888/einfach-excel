import { atom } from '@einfach/core'
import { resetWorkbookRibbonOverflowAtom } from './ribbon-overflow'

export const WORKBOOK_RIBBON_TABS = ['Start', 'Insert', 'Formulas', 'Data', 'View'] as const
export type WorkbookRibbonTab = typeof WORKBOOK_RIBBON_TABS[number]

// 每个工作簿 store 独立保存分类，不写入 Rust 工作簿或撤销历史。
const ribbonTabStateAtom = atom<WorkbookRibbonTab>('Start')
export const workbookRibbonTabAtom = atom((get) => get(ribbonTabStateAtom))
/** 切换分类同时清空折叠，新分类的组由视图重新测量。 */
export const selectWorkbookRibbonTabAtom = atom(null, (get, set, tab: WorkbookRibbonTab) => {
  if (!WORKBOOK_RIBBON_TABS.includes(tab) || get(ribbonTabStateAtom) === tab) return
  set(ribbonTabStateAtom, tab)
  set(resetWorkbookRibbonOverflowAtom)
})

workbookRibbonTabAtom.debugLabel = 'spreadsheet.toolbar.ribbonTab'
selectWorkbookRibbonTabAtom.debugLabel = 'spreadsheet.toolbar.selectRibbonTab'
